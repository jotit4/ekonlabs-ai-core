# Diseño — Módulo de Calendario Nativo

**Fecha:** 2026-05-13
**Estado:** ✅ Implementado — 2026-05-15 (ver `CHANGELOG.md`)
**Contexto:** Reemplaza la dependencia de Google Calendar API por un sistema nativo en Supabase.
Resuelve el problema de disponibilidad multi-profesional de ISADI y habilita el dashboard de agenda por profesional.

---

## Motivación

El sistema actual usa `calendar_service.py` (Google Calendar API v3) con un modelo `1 servicio → 1 calendar_id`. Esto no soporta múltiples profesionales por servicio ni permite mostrar disponibilidad separada por profesional. ISADI tiene servicios (Kinesiología, Fisioterapia, Rehabilitación física) con dos profesionales (Patricia Pérez Bernal y Aldo Luque) que comparten actualmente un único calendario.

---

## Decisiones de diseño

### 1. Abandonar Google Calendar a favor de un módulo nativo

**Decisión:** Reemplazar `calendar_service.py` (Google Calendar API) por un sistema de disponibilidad propio en Supabase.

**Razón:** El modelo actual (`1 servicio → 1 calendar_id`) no puede representar múltiples profesionales por servicio. ISADI tiene servicios con dos profesionales (Patricia Pérez Bernal y Aldo Luque) compartiendo un único calendario, lo que hace imposible distinguir disponibilidad por profesional. Además, Odontología y Traumatología (Dr. Villavicencio) tienen `calendar_id = PLACEHOLDER` — calendarios reales nunca fueron configurados. Un módulo nativo resuelve todos estos problemas sin dependencias externas y habilita el dashboard de agenda propio.

---

### 2. Asignación de profesional: Modelo A (auto-asigna, no el paciente elige)

**Decisión:** Cuando hay múltiples profesionales disponibles para un servicio, el sistema selecciona al primero con disponibilidad. El paciente no es consultado sobre qué profesional prefiere.

**Razón:** Para los servicios grupales de ISADI (Kinesiología, Fisioterapia, Rehabilitación física con `capacity_per_slot=6`) la sesión es compartida — preguntar qué profesional prefiere no tiene sentido clínico ni práctico. Para los servicios individuales (Odontología, Traumatología), el profesional es único por servicio, así que tampoco hay elección posible en la práctica actual de ISADI.

---

### 3. Profesional de preferencia — búsqueda extendida primero, fallback con aviso

**Decisión:** Cuando un paciente tiene `preferred_professional_id` seteado:
- **Primer intento (B):** buscar slots del profesional preferido con el doble del lookahead estándar antes de rendirse.
- **Fallback (A):** si definitivamente no hay slots, avisar al paciente (*"tu profesional de cabecera no tiene disponibilidad próxima"*) y mostrar slots del equipo general.

**Razón:** En atención de salud la continuidad con el profesional es un valor real — muchos pacientes tienen una relación establecida y no quieren cambiar sin necesidad. Forzarlos a cambiar de profesional porque el sistema no intentó suficientemente es mala experiencia. El doble de ventana temporal da una oportunidad genuina de encontrar un turno con quien el paciente confía, y solo si realmente no hay opciones se ofrece la alternativa con aviso explícito.

---

### 4. Seteo del profesional preferido: auto-set silencioso al confirmar el primer turno

**Decisión:** Al confirmar el primer turno de un paciente nuevo, `booking_node` setea automáticamente `patients.preferred_professional_id` con el profesional asignado. Sin preguntar, sin fricción adicional.

**Razón:** Agregar una pregunta explícita al flujo de registro (*"¿querés que este sea tu profesional de cabecera?"*) agrega un turno de conversación sin valor perceptible para el paciente en su primera interacción. El auto-set es transparente y produce el comportamiento correcto en el 90% de los casos: quien atendió al paciente la primera vez es naturalmente su referente. Puede ser sobreescrito manualmente desde el dashboard si es necesario.

---

### 5. Disponibilidad semanal cargada por el propio profesional

**Decisión:** Cada profesional gestiona su `professional_schedules` y `blocked_times` desde su vista en el dashboard. El superadmin de ISADI puede ver todo pero la carga es descentralizada.

**Razón:** La disponibilidad de cada profesional es información que ellos mismos conocen mejor. Centralizar la carga en un admin crea un cuello de botella operativo y errores por teléfono descompuesto. Darle acceso directo a cada profesional es más escalable y reduce la carga administrativa de ISADI.

---

### Resumen de decisiones

| Decisión | Elección |
|----------|----------|
| Backend de disponibilidad | Módulo nativo en Supabase (reemplaza Google Calendar API) |
| Asignación de profesional | Modelo A: auto-asigna al primero disponible |
| Paciente con profesional preferido | Búsqueda extendida (2× lookahead) → fallback con aviso |
| Seteo del profesional preferido | Auto-set silencioso al confirmar el primer turno |
| Gestión de disponibilidad semanal | El propio profesional desde el dashboard |
| Retrocompatibilidad | Flag `tenants.uses_native_calendar`; `calendar_service.py` intacto para otros tenants |

---

## Modelo de datos

### Tablas nuevas

```sql
-- Profesionales del tenant
CREATE TABLE professionals (
  professional_id   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID        NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  email             TEXT        NOT NULL UNIQUE,  -- login al dashboard
  active            BOOLEAN     DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Qué servicios realiza cada profesional (many-to-many)
CREATE TABLE service_professionals (
  service_id        UUID NOT NULL REFERENCES services(service_id) ON DELETE CASCADE,
  professional_id   UUID NOT NULL REFERENCES professionals(professional_id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, professional_id)
);

-- Disponibilidad semanal recurrente (cargada por el profesional)
CREATE TABLE professional_schedules (
  schedule_id       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id   UUID        NOT NULL REFERENCES professionals(professional_id) ON DELETE CASCADE,
  day_of_week       INT         NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Lun … 6=Dom
  start_time        TIME        NOT NULL,
  end_time          TIME        NOT NULL,
  CHECK (start_time < end_time)
);

-- Excepciones: vacaciones, licencias, días bloqueados
CREATE TABLE blocked_times (
  block_id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id   UUID        NOT NULL REFERENCES professionals(professional_id) ON DELETE CASCADE,
  date_from         DATE        NOT NULL,
  date_to           DATE        NOT NULL,
  reason            TEXT,
  CHECK (date_from <= date_to)
);
```

### Columnas nuevas en tablas existentes

```sql
-- Paciente con profesional de preferencia (opcional)
ALTER TABLE patients
  ADD COLUMN preferred_professional_id UUID REFERENCES professionals(professional_id);

-- Turno vinculado al profesional que lo atiende
ALTER TABLE appointments
  ADD COLUMN professional_id UUID REFERENCES professionals(professional_id);

-- Flag de migración por tenant
ALTER TABLE tenants
  ADD COLUMN uses_native_calendar BOOLEAN DEFAULT FALSE;
```

---

## Nuevo servicio: `availability_service.py`

Ubicación: `app/services/availability_service.py`

### Interfaz principal

```python
def get_available_slots(
    service_id: str,
    tenant_id: str,
    preferred_professional_id: str | None = None,
    lookahead_hours: int = 72,
    start_date: datetime | None = None,
) -> dict:
    """
    Returns:
        {
          "slots": [
            {
              "start": str,               # ISO 8601 con timezone
              "end": str,
              "display": str,             # "Martes 13 de Mayo — 10:00 a 11:00 hs"
              "professional_id": str,
              "professional_name": str
            }
          ],
          "fell_back_from_preferred": bool,
          "preferred_professional_name": str | None
        }
    """
```

### Algoritmo

```
1. Obtener profesionales del servicio via service_professionals JOIN professionals

2. Si preferred_professional_id != None Y ese profesional está en la lista:
     → buscar slots solo de ese profesional con lookahead_hours * 2
     → si hay slots → retornar con fell_back_from_preferred=False

3. Fallback a todos los profesionales con lookahead_hours estándar:
     → por cada profesional:
         a. Expandir professional_schedules en el rango de fechas → candidatos (paso 1h)
         b. Restar appointments existentes:
              slot ocupado si COUNT(appointments donde professional_id=P, start=T, status='confirmed')
                            >= capacity_per_slot del servicio
                            (o >= 1 para servicios individuales / capacity_per_slot IS NULL)
         c. Restar blocked_times del profesional en esa fecha
     → merge de todos los slots libres, ordenar por start
     → retornar los primeros 3

4. Si se llegó al paso 3 por haber intentado el preferido: fell_back_from_preferred=True
```

---

## Cambios en el agente

### `scheduling_node`

```python
# Nuevo: obtener preferred_professional_id del paciente
patient = patient_service.get_patient_by_phone(tenant_id, phone_number)
preferred_professional_id = getattr(patient, "preferred_professional_id", None)

# Reemplaza la llamada a calendar_service:
result = availability_service.get_available_slots(
    service_id=selected_service_id,
    tenant_id=tenant_id,
    preferred_professional_id=preferred_professional_id,
    lookahead_hours=settings.SCHEDULING_LOOKAHEAD_HOURS,
    start_date=start_date,
)
```

Nuevo flag de retorno al state:
```python
"preferred_professional_fallback": result["fell_back_from_preferred"]
```

### `booking_node._finalize_registration()`

Al crear el appointment:
```python
# Tomar professional_id del slot seleccionado (viene en booked_slot)
professional_id = booked_slot.get("professional_id")

# Crear appointment con professional_id
appointment_service.create_appointment(..., professional_id=professional_id)

# Auto-set preferred_professional si el paciente no tiene uno
if patient.preferred_professional_id is None and professional_id:
    patient_service.set_preferred_professional(patient_id, professional_id)
```

### `generation_node`

Si `state.get("preferred_professional_fallback") == True`:
- Incluir en el contexto del prompt que el profesional preferido no tiene disponibilidad próxima
- El agente comunica esto naturalmente al paciente antes de mostrar los slots alternativos

### State schema — campos nuevos

```python
selected_professional_id:        NotRequired[str | None]
selected_professional_name:      NotRequired[str | None]
preferred_professional_fallback: NotRequired[bool]
```

---

## Selección de servicio (`scheduling_node`)

```python
if tenant_config.uses_native_calendar:
    result = availability_service.get_available_slots(...)
else:
    # Backwards compat: Google Calendar
    slots = calendar_service.get_available_slots(calendar_id=..., credentials_dict=...)
    result = {"slots": slots, "fell_back_from_preferred": False, ...}
```

---

## Dashboard (Epic 8)

Dos vistas nuevas, sin interferir con Epic 7:

| Vista | Acceso | Contenido |
|-------|--------|-----------|
| Mi Agenda | Profesional logueado | Sus turnos del día/semana; gestión de `professional_schedules` y `blocked_times` |
| Agenda General | Superadmin ISADI | Todos los profesionales; filtrable por profesional, servicio y fecha |

---

## Migraciones

| # | Descripción |
|---|-------------|
| 014 | CREATE TABLE `professionals` |
| 015 | CREATE TABLE `service_professionals` |
| 016 | CREATE TABLE `professional_schedules` |
| 017 | CREATE TABLE `blocked_times` |
| 018 | ADD COLUMN `patients.preferred_professional_id` + `appointments.professional_id` |
| 019 | ADD COLUMN `tenants.uses_native_calendar` BOOLEAN DEFAULT FALSE |
| 020 | Seed data ISADI: profesionales, service_professionals, schedules iniciales |

---

## Resumen de impacto

| Componente | Cambio |
|-----------|--------|
| `calendar_service.py` | Sin cambios — se mantiene para tenants con Google Calendar |
| `availability_service.py` | ✅ Implementado |
| `scheduling_node` | ✅ Implementado: usa availability_service vía `uses_native_calendar` flag |
| `booking_node` | ✅ Implementado: crea/cancela turnos vía Supabase (nativo) |
| `generation_node._finalize_registration()` | ✅ Implementado: crea appointment con `professional_id` |
| State schema | Sin cambios en esta iteración (preferred_professional_fallback diferido) |
| DB | ✅ 4 tablas nuevas + 3 columnas — migraciones 014–020 en dashboard |
| Dashboard | ✅ Epic 9 — "Mi Agenda" filtra por `professional_id` |
| Google Calendar (ISADI) | ✅ Deprecado — `uses_native_calendar=TRUE` activado en DB |

---

## Notas de implementación vs. diseño

El diseño original incluía soporte para `preferred_professional_id` (búsqueda extendida 2× lookahead + fallback con aviso, y auto-set silencioso al confirmar primer turno). Estas características **no fueron implementadas en la primera iteración** — la interfaz final de `get_available_slots()` es más simple:

```python
def get_available_slots(
    tenant_id: str,
    service_id: str,
    duration_minutes: int,
    lookahead_hours: int,
    start_date: datetime | None = None,
) -> list[dict]:
```

Retorna hasta 3 slots sin información de profesional preferido ni fallback. El campo `preferred_professional_id` en `patients` existe en la DB pero no se usa aún. Estas funcionalidades quedan para una iteración futura cuando ISADI lo requiera.
