# Changelog — ekonlabs-ai-core

Registro de cambios por sesión de implementación.

---

## 2026-05-15 — Calendario Nativo: soporte completo en el agente IA

**Commit:** `aed45d7` | **Tests:** 691 passing, 2 failing pre-existentes (`test_rag.py`) | **Archivos:** 16 modificados / creados

### Contexto

ISADI (único tenant activo) tiene `uses_native_calendar = TRUE` en la base de datos. El backend nunca había implementado el path nativo — el agente usaba `calendar_service.py` (Google Calendar API), que nunca fue configurado para ISADI. Resultado: el agente no podía encontrar slots, las reservas no se completaban, y los turnos creados por IA no aparecían en el dashboard porque no incluían `professional_id`.

Esta sesión implementó el soporte completo del calendario nativo, incluyendo disponibilidad, reserva, cancelación, y alineación con el dashboard.

---

### Nuevos archivos

#### `app/services/availability_service.py`

Servicio de disponibilidad nativo. Lee `professional_schedules`, `blocked_times`, `service_professionals`, y `appointments` directamente desde Supabase.

**`get_available_slots(tenant_id, service_id, duration_minutes, lookahead_hours, start_date)`**
- Genera slots candidatos expandiendo los horarios semanales del profesional en el rango de fechas
- Resta turnos existentes (confirmados) considerando `capacity_per_slot`:
  - `capacity_per_slot IS NOT NULL` → cuenta todos los turnos del servicio (sesión grupal)
  - `capacity_per_slot IS NULL` → cuenta solo los turnos del profesional en ese slot (servicio individual)
- Resta `blocked_times` del profesional
- Compara fechas con `datetime.fromisoformat()` — crítico porque Supabase retorna UTC (`+00:00`) y los slots se generan en hora Argentina (`-03:00`)
- Retorna máximo 3 slots en formato `{"start": iso, "end": iso, "display": "Lunes 19 de Mayo, 10:00 hs"}`

**`resolve_professional_id(service_id)`**
- Retorna el `professional_id` único si el servicio tiene exactamente un profesional
- Retorna `None` si el servicio tiene múltiples profesionales (ambiguo — se usa `NULL` en el appointment)

#### `tests/test_services/__init__.py`

Inicializador del módulo de tests de servicios.

#### `tests/test_services/test_availability_service.py`

16 tests unitarios para `availability_service`:
- Slots disponibles básicos
- Solapamiento con turno existente (grupal e individual)
- Bloqueos del profesional
- Límite de 3 slots
- Bug regression F1: comparación UTC vs. timezone Argentina con `datetime.fromisoformat()`
- Bug regression F2: independencia de slots entre dos profesionales del mismo servicio
- Bug regression F3: guard `slot_dt_start >= to_dt` en el último día del lookahead

#### `tests/test_services/test_patient_service.py`

8 tests para las funciones nuevas en `patient_service`:
- `find_upcoming_appointment()`
- `cancel_appointment_by_id()`
- `create_appointment()` con `professional_id`

---

### Cambios en archivos existentes

#### `app/models/tenant.py`

- Agrega `uses_native_calendar: bool = False` a `TenantConfig`
- `TenantResponse` lo hereda automáticamente
- `get_tenant_config()` ya usaba `select("*")` — Pydantic lo pickea sin cambios en la query

#### `app/models/patient.py`

- Agrega `professional_id: str | None = None` a `Appointment` (después de `service_id`)
- Evita error de validación Pydantic cuando Supabase retorna `professional_id` en appointments creados por el agente

#### `app/services/patient_service.py`

- `create_appointment(...)`: acepta `professional_id: str | None = None`; lo incluye en `insert_data` solo si no es `None`
- `find_upcoming_appointment(tenant_id, phone_number) -> dict | None`: busca el próximo turno confirmado de un paciente por número de teléfono; fail-safe (retorna `None` en cualquier error)
- `cancel_appointment_by_id(appointment_id, cancelled_by, cancellation_reason) -> bool`: cancela un turno por `appointment_id` (no por `calendar_event_id`); fail-safe

#### `app/agent/nodes/scheduling.py`

- Agrega branch `uses_native = getattr(tenant_config, "uses_native_calendar", False)`
- Path nativo: llama `availability_service.get_available_slots()` — sin credenciales GCal
- Path legacy: `calendar_service.get_available_slots()` con `calendar_id` y credentials
- `start_date` se calcula una vez antes del branch y es compartida por ambos paths
- Backward-compatible: `getattr(..., False)` — tenants sin el flag siguen usando GCal

#### `app/agent/nodes/booking.py`

- Agrega `uses_native = getattr(tenant_config, "uses_native_calendar", False)`
- Guard `if not calendar_id and not uses_native:` — sin GCal y sin nativo retorna vacío
- **Cancelación Step 1 (nativo):** `find_upcoming_appointment()` → guarda `appointment_id` como `cancel_event_id`
- **Cancelación Step 2 (nativo):** `cancel_appointment_by_id(pending_ref_id)` — sin llamada a GCal
- **Confirmación de paciente conocido (nativo):** `event_id=None`, llama `resolve_professional_id()`, crea appointment con `professional_id=prof_id`
- Path legacy (GCal) sin cambios

#### `app/agent/nodes/generation.py`

- `_finalize_registration()` agrega branch nativo:
  - Llama `availability_service.resolve_professional_id(selected_service_id)` para obtener `professional_id`
  - Llama `patient_service.create_appointment(..., calendar_event_id=None, professional_id=prof_id)`
  - Excepción no-fatal: logeada y no relanzada (el turno del paciente nuevo puede quedar sin appointment en edge cases de red)
  - `event_id = None` — sin crash en el state posterior
- Scheduling path (LLM-based) en `generation_node` no modificado

#### Tests — fixes MagicMock truthy bug

En todos los helpers/fixtures que crean mocks de `TenantConfig`, se agregó `mock.uses_native_calendar = False` explícitamente. Sin este fix, `getattr(mock, "uses_native_calendar", False)` retorna un `MagicMock()` object truthy y los tests legacy que patchean `calendar_service` entran al path nativo y fallan.

Archivos afectados:
- `tests/test_agent/test_nodes/test_scheduling.py`
- `tests/test_agent/test_nodes/test_booking.py`
- `tests/test_agent/test_nodes/test_generation.py`
- `tests/test_agent/test_graph.py`
- `tests/test_agent/test_nodes/test_turn1_flow.py` (renombrado de test_turn1_flow.py a test_nodes)
- `tests/test_agent/test_nodes/test_turn4_flow.py`
- `tests/test_agent/test_nodes/test_extended_registration.py`

---

### Bugs resueltos durante implementación

**F1 — Comparación de fechas UTC vs. Argentina (Blocker en CR-1)**

`availability_service.py` comparaba slots contra appointments con comparación de strings ISO. Supabase retorna `start_at` en UTC (`2026-05-19T13:00:00+00:00`) y los slots se generan en Argentina (`2026-05-19T10:00:00-03:00`). La comparación de strings fallaba silenciosamente — slots marcados como disponibles cuando en realidad estaban ocupados. Fix: `datetime.fromisoformat()` para ambos lados antes de comparar.

**F2 — Conteo de ocupación no distinguía profesional en servicios individuales (High en CR-1)**

Para servicios con `capacity_per_slot IS NULL` (atención individual), el conteo de turnos existentes contaba todos los profesionales del servicio. Fix: dos branches — grupales cuentan todos, individuales cuentan solo por `professional_id`.

**F3 — Slots del último día sin guard de límite (High en CR-1)**

Slots generados para el último día del lookahead que caían después de `to_dt` no eran filtrados. Fix: `if slot_dt_start >= to_dt: break` antes del check de solapamiento.

**DS-2 out-of-scope (Blocker en CR-2)**

DS-2 modificó el scheduling path LLM-based en `generation.py` convirtiéndolo a determinístico, y actualizó `test_generation.py` pero no `test_turn1_flow.py` ni `test_graph.py` → 7 regresiones. Fix: revert completo a pre-DS-2 del scheduling path en `generation.py`.

---

### Alineación con el dashboard

El dashboard (`ekonlabs-dashboard`) filtra "Mi Agenda" por `professional_id` del profesional logueado. Antes de esta implementación, los turnos creados por el agente IA tenían `professional_id = NULL` y no aparecían en la vista. Con `resolve_professional_id()` y el campo en `create_appointment()`, los turnos del agente ahora son visibles en el dashboard.

La tabla `appointments` ya tenía la columna `professional_id` (migración 018 del dashboard, 2026-05-15).
