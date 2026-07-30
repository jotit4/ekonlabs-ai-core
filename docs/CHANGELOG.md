# Changelog de Implementación

Registro de trabajo por Epic/Story — decisiones técnicas, hallazgos de code review y bugs resueltos.

---

## Sesión ISADI — series iniciadas hoy desde Recepción — 2026-07-30

**Tipo:** Feedback operativo + disponibilidad manual + simplificación UX | **Estado:** validación local

### Contexto

Recepción arma paquetes de 5/10 sesiones durante sus momentos libres y necesita
usar como ancla un bloque de hoy aunque su hora ya haya comenzado. La
disponibilidad estándar lo ocultaba por `slot_start > NOW()`, desplazando la
serie a mañana. El flujo también volvía a pedir Servicio y Profesional pese a
que la operación acordada es “Fisioterapia” con profesional indistinto.

### Cambios

- Migración `060`: RPC `check_reception_availability`, aislada de la RPC
  estándar, con validación interna de rol `receptionist`, tenant del JWT y fecha
  mínima definida en `America/Argentina/Buenos_Aires`.
- `/api/availability` transporta `include_elapsed_today` solo para Recepción y
  usa una clave de caché distinta; agente, admin y consumidores sin flag
  mantienen `check_clinic_availability`.
- El scheduler rotula los slots transcurridos como `horario de hoy` y usa la
  excepción únicamente para el ancla. Las propuestas siguientes conservan
  disponibilidad futura estándar.
- En series x5/x10 de Recepción se fija el servicio activo exacto
  `Fisioterapia`, se ocultan Servicio/Profesional, el paquete se crea sin
  profesional fijo y cada sesión conserva el profesional real del hueco.
- Si falta el servicio canónico, el scheduler y la creación quedan bloqueados
  con una indicación accionable para Administración.

### Seguridad y cupo

La RPC replica el núcleo de disponibilidad de la migración 058, incluido el
conteo por profesional/horario. El trigger concurrente `enforce_slot_capacity`
sigue siendo el candado definitivo y no se modifica la RPC estándar.

---

## Sesión ISADI — recepción, paquetes y vista Mes — 2026-07-16

**Tipo:** Implementación + recuperación de sesión + hardening UX | **Commit:** `0c45764` | **Deploy:** `origin/ekonlabs-dashboard` | **Tests:** 2913/2913 suite previa al ajuste visual; 104/104 paquetes; 55/55 Mes

### Contexto

Se retomó la sesión Claude Code `isadi-16-7`, interrumpida por límite de contexto, y se completó el frente pendiente de agendado de sesiones de paquetes. Luego se incorporó feedback directo de ISADI sobre densidad e interacción de la vista Mes. El lote también consolidó la simplificación del flujo de recepción preparada en la sesión original.

### Recepción

- Grupos de agenda `Fisioterapia`, `Pileta` y `Pilates` mediante `services.reception_group`.
- Selector Día/Semana/Mes siempre visible para recepción.
- “Dar un turno” de Fisioterapia sin pedir servicio ni profesional: la persona elige hora y el sistema conserva el servicio/profesional reales del hueco.
- `/api/availability` acepta múltiples servicios y modo cualquier profesional, preservando la identidad de cada slot.
- Navegación de inicio y padre por rol centralizada en `src/lib/landing.ts` y usada por `AppTopbar`.

### Paquetes

- Bonos con profesional fijo o “cualquier profesional disponible”.
- Horarios deduplicados visualmente por hora, sin perder el `professional_id` real.
- La primera sesión dispara automáticamente la propuesta editable de las restantes; no hay botón ni estado intermedio “Proponer/Proponiendo”.
- Fechas sin coincidencia quedan pendientes, sin inventar horarios; rangos largos se dividen según el límite del endpoint.
- El color elegido se propaga a toda la tanda.

### Vista Mes

- Chips de una línea `hora · paciente`, con hover/foco y acceso por teclado.
- Excedentes explícitos `+N turno(s)` que abren el modal con el día completo.
- Toda el área libre de un día del mes seleccionado abre el modal; turnos, número y badges mantienen acciones aisladas.
- Días grises adyacentes inertes porque no pertenecen al rango cargado.

### Persistencia y despliegue

- Versionada la migración `20260716120000_053_services_reception_group.sql`, ya aplicada en producción antes del commit.
- Commit `0c45764fffcaa4ed2fc00598ebba828199554053` publicado por fast-forward en `origin/ekonlabs-dashboard`.
- `.claude/` y dos imágenes de WhatsApp quedaron fuera deliberadamente.

### Deuda conocida

La carrera de cupo/índice al crear sesiones, el posible appointment huérfano tras fallo del UPDATE, respuestas parciales `skipped`, límites de `service_ids` y hardening del modal diario quedaron registrados en `_bmad-output/implementation-artifacts/deferred-work.md` para tareas separadas.

---

## Sesión UX/UI Calendario — 2026-05-21

**Tipo:** Mejora visual + rediseño de vistas | **Commits:** `2c0f55b`, `1cb6781` | **Tests:** 13 nuevos passing (CalendarView), suite completa estable

### Contexto

Las vistas Semana y Día del módulo Calendario eran ilegibles en condiciones reales de uso (clínica con múltiples profesionales). El time-grid de react-big-calendar coloca eventos solapados en columnas paralelas angostas: con 10–16 turnos simultáneos de distintos profesionales, los chips se volvían demasiado estrechos para mostrar cualquier información útil. El fondo `.rbc-today` pintaba toda la columna del día actual en azul intenso.

### Causa raíz

El problema no era de CSS ni de datos — era estructural: react-big-calendar fue diseñado para agendas personales (1–2 eventos solapados). En una clínica con 4+ profesionales con horarios superpuestos, el layout de columnas paralelas colapsa inevitablemente. Ningún override de CSS resuelve la causa raíz.

### Fix 1 — Vista Semana: reemplazar time-grid por `WeekColumnsView` custom

**Archivo:** `src/components/agenda/CalendarViewRangeReadOnly.tsx`

Se eliminó el uso de `<Calendar view={Views.WEEK}>` de react-big-calendar para la vista Semana. Se implementó `WeekColumnsView`: un componente custom que usa CSS Grid (`grid-template-columns: repeat(7, 1fr)`) con 7 columnas, una por día.

**Diseño del componente:**
- Cada columna tiene header (día abreviado + número circular, hoy en azul) y contador de turnos
- Los eventos se renderizan como botones apilados verticalmente, ordenados por `start.getTime()`
- Cada chip: borde izquierdo coloreado por estado + fondo semi-transparente (`${color}18`) + hora en bold + paciente + profesional
- La columna tiene `overflow-y: auto` para scroll independiente cuando hay muchos turnos
- La vista Mes sigue usando `<Calendar view={Views.MONTH}>` de react-big-calendar sin cambios

**Resultado:** Los 16 turnos del jueves (todos los profesionales) ahora son completamente legibles — apilados uno debajo del otro, cada uno con toda la información visible.

**Decisión de diseño:** Se eligió lista vertical sobre time-grid con recursos (columna por profesional) porque la vista de recursos requeriría scroll horizontal y un ancho impracticable con 4+ profesionales.

### Fix 2 — Vista Día: reemplazar DnD time-grid por `DayListView` custom

**Archivo:** `src/components/agenda/CalendarView.tsx`

Se eliminó `DragAndDropCalendar` (react-big-calendar DnD addon) y toda la lógica asociada: `withDragAndDrop`, `handleEventDrop`, `pendingDrop`, `RescheduleConfirmModal`, `useQueryClient`, `toast`. El componente pasó de 322 líneas a 159 líneas.

Se implementó `DayListView`: lista vertical full-width con un card por turno.

**Diseño del card:**
- Borde izquierdo coloreado por estado (4px)
- Sección izquierda: hora inicio (bold, en color) + hora fin (gris)
- Sección central: nombre del paciente (bold) + servicio · profesional (gris)
- Sección derecha: ícono reloj si `calendar_event_id === null` (sync pendiente) + botón lápiz si `onReschedule` está definido
- Hover con `rgba(0,0,0,0.06)` en el botón de reprogramar

**DnD vs. botón de reprogramar:** La funcionalidad de reprogramar se mantiene íntegra a través del botón de lápiz (`onReschedule` prop), que delega al modal de reprogramación manual del parent. El DnD era fundamentalmente inutilizable con 16 eventos solapados y su eliminación simplifica significativamente el componente.

### Colores de estado — migración a hex

Ambos componentes usan `getEventColor()` actualizado para retornar hex en lugar de CSS vars:

| Estado | Hex |
|---|---|
| `confirmed` | `#0071e3` |
| `rescheduled` | `#f97316` |
| `cancelled` | `#8e8e93` |
| `no_show` | `#ef4444` |
| `pending` / `pending_calendar` | `#8b5cf6` |

**Razón:** Los valores hex permiten componer `${color}18` y `${color}30` como colores RGBA en JavaScript (8 dígitos hex), necesarios para los fondos semi-transparentes de los chips. CSS vars no admiten este patrón en JS.

### Tests actualizados

`CalendarView.test.tsx` fue completamente reescrito para reflejar la nueva implementación:
- Se eliminaron mocks de react-big-calendar, DnD addon, `@tanstack/react-query`, `sonner`, y `global.fetch`
- Se agregaron tests para: estado vacío, skeleton, error/reintentar, renderizado de campos, orden cronológico, filtro de appointments inválidos, callback onReschedule, visibilidad del botón reprogramar, ícono de sync pendiente
- **13 tests passing, 0 fallos**

---

## Sesión de debugging y performance — 2026-05-20

**Tipo:** Diagnóstico + bugfixes + optimización de performance | **Commits:** `9ec0984`, `6ffa18f` | **Tests:** 1356 passing (10 fallos pre-existentes del Epic 10, no relacionados)

### Contexto

Primer uso real del dashboard por parte de ISADI. Se detectaron errores sistémicos en múltiples módulos: "Error al cargar la ficha del paciente. Recargá la página." (Pacientes), "Conversación no encontrada." (Conversaciones), y tiempos de carga de ~5 segundos en el módulo Calendario/Agenda.

### Causa raíz — JWT sin `tenant_id`

La causa de los errores de carga en todos los módulos era un **token JWT emitido sin el claim `tenant_id`**. Al tener `tenant_id` ausente, todas las RLS policies que evalúan `tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')` devolvían 0 filas en lugar de retornar un error explícito. El layout previo solo validaba `app_role`, permitiendo que usuarios con JWTs incompletos entrasen al dashboard.

Los logs del servidor mostraban `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` — el refresh_token de sesiones antiguas ya no existía en Supabase, confirmando que los tokens eran de sesiones anteriores al hook fix del 2026-05-15.

### Fix 1 — Guard de `tenant_id` en el layout (`src/app/(dashboard)/layout.tsx`)

Se agregó `tenant_id` al guard del layout. Si el JWT no contiene el claim, el layout hace sign out y redirige al login. Al re-loguearse, el hook `custom_access_token_hook` inyecta el `tenant_id` en el nuevo token.

```typescript
// Antes
if (!role || !VALID_ROLES.includes(role)) { signOut(); redirect('/login') }

// Después
if (!role || !VALID_ROLES.includes(role) || !tenantId) { signOut(); redirect('/login') }
```

### Fix 2 — Performance: reemplazar `getUser()` por `getSession()` en el middleware (`src/proxy.ts`)

El middleware se ejecuta en **cada request** (incluyendo todos los requests de API routes del cliente). `supabase.auth.getUser()` hace una llamada HTTP al servidor de Supabase Auth (~300–500ms de latencia). Se reemplazó por `getSession()` que lee el token directamente de la cookie sin llamada de red (~0ms).

**Resultado:** reducción de ~400ms por request en el middleware. El tiempo de carga del Calendario pasó de ~5 segundos a carga casi inmediata.

**Trade-off aceptado:** el middleware ya no valida el token contra el servidor en cada request. La seguridad real se mantiene porque el layout usa `getUser()` (que sí valida) y las RLS de Supabase garantizan aislamiento de datos por `tenant_id`.

```typescript
// Antes: llamada HTTP al servidor de Supabase Auth en cada request
const { data: { user } } = await supabase.auth.getUser()

// Después: lectura local de cookie, sin HTTP
const { data: { session } } = await supabase.auth.getSession()
const user = session?.user
```

### Fix 3 — staleTime en página de detalle de conversaciones (`src/app/(dashboard)/conversaciones/[id]/page.tsx`)

La página de detalle tenía `staleTime: 0`, lo que causaba un refetch inmediato al montarse. Si ese refetch devolvía `{ conversations: [] }` (por RLS sin tenant_id), React Query actualizaba el cache y borraba los datos que el sidebar ya tenía. Se alineó a `staleTime: 30_000` para coincidir con el `refetchInterval` del sidebar.

### Fix 4 — URL encoding del `+` en números de teléfono (`src/components/conversaciones/ConversationListSidebar.tsx`, `src/app/(dashboard)/conversaciones/[id]/page.tsx`)

El número de teléfono se usa como segmento de URL: `/conversaciones/+5492612416059`. El carácter `+` en path segments puede ser transmitido como literal o codificado como `%2B` según el browser o el servidor. La comparación `c.phone_number === conversationId` fallaba porque `params.id` llegaba codificado mientras que `c.phone_number` venía de la DB sin codificar.

**Solución:** `encodeURIComponent(phone)` al construir el link en el sidebar, `decodeURIComponent(params?.id)` al leerlo en la página de detalle, y `decodeURIComponent(rawSegment)` al extraer el `selectedPhone` del pathname para el resaltado de la fila activa.

### Logs colaterales durante diagnóstico

- `FastAPIError: status 503` — el servicio del AI Core (FastAPI en EasyPanel) estaba caído durante el diagnóstico. Problema separado del dashboard, no relacionado con estos fixes.
- 10 tests fallando pre-existentes del Epic 10 en `src/app/(dashboard)/conversaciones/[id]/page.test.tsx` — el hook `useConversationThreadRealtime` llama `useQueryClient()` sin `QueryClientProvider` en el setup del test. No relacionado con los cambios de esta sesión.

---

## Sesión de alineación backend ↔ dashboard — 2026-05-15

**Tipo:** Verificación de alineación + implementación en backend | **Tests dashboard:** 1270 passing (sin cambios en dashboard)

### Contexto

Sesión de verificación exhaustiva entre ekonlabs-dashboard (Next.js 16, Epics 1–9 done) y ekonlabs-ai-core (Python/FastAPI/LangGraph). El objetivo fue confirmar que las operaciones del agente IA vía WhatsApp se reflejen correctamente en el dashboard.

### Gap crítico encontrado y resuelto

**Problema:** El backend nunca implementó el path de calendario nativo. El flag `uses_native_calendar = TRUE` existía en la DB de ISADI, pero el agente ignoraba el flag y llamaba a `calendar_service.py` (Google Calendar API), que nunca fue configurado para ISADI. Resultado: el agente fallaba silenciosamente al buscar disponibilidad, las reservas no se completaban, y los turnos creados por IA tenían `professional_id = NULL` → invisibles en "Mi Agenda" del dashboard.

**Solución implementada en el backend** (`ekonlabs-ai-core`, commit `aed45d7`):
- `availability_service.py` — nuevo servicio que lee `professional_schedules`, `blocked_times`, `service_professionals`, y `appointments` de Supabase
- Branch `uses_native_calendar` en `scheduling_node`, `booking_node`, y `generation_node._finalize_registration()`
- `professional_id` escrito en cada turno creado por el agente → turnos visibles en "Mi Agenda"
- Backward-compatible: `getattr(tenant_config, "uses_native_calendar", False)` — tenants GCal sin cambios

### Alineación verificada

| Funcionalidad del dashboard | Alineación con backend |
|---|---|
| "Mi Agenda" filtra por `professional_id` | ✅ Backend ahora escribe `professional_id` |
| Bandeja de conversaciones con context del agente | ✅ Via FastAPI `/conversations/{phone}/context` |
| Takeover de conversación | ✅ Via FastAPI `/takeover` |
| Config del agente (system prompt) | ✅ Escribe directo en `tenants.system_prompt_override` |
| Shadow mode | ✅ Escribe directo en `tenants.shadow_mode_enabled` |
| Banners GCal ocultos para ISADI | ✅ `uses_native_calendar=TRUE` en DB |

---

## QA Sprint — Pre-lanzamiento ISADI

**Fecha:** 2026-05-15 | **Tipo:** Sweep de bugs + verificación visual completa | **Tests finales:** 1270 passing, 0 fallos

### Contexto

Sesión de QA exhaustiva previa al primer mes de prueba de ISADI. Se navegó manualmente cada sección del dashboard con browser automation, se identificaron y corrigieron 9 bugs (5 críticos de seguridad/auth, 2 visuales, 1 de hydration React 19, 1 de datos de test).

### Bugs encontrados y resueltos

#### 1. Telemetría Refine generando ruido en logs (503 silencioso)
- **Archivo:** `src/app/(dashboard)/providers.tsx`
- **Fix:** `options={{ ..., disableTelemetry: true }}` en `<Refine>`
- `telemetry.refine.dev` era contactado en cada carga de página, generando errores 503 en los logs

#### 2. Header de Agenda con capitalización incorrecta ("Viernes 15 De Mayo")
- **Archivo:** `src/app/(dashboard)/agenda/page.tsx`
- **Causa:** CSS `text-transform: capitalize` capitaliza CADA palabra; date-fns con locale `es` retorna todo en minúsculas
- **Fix:** Removido el class `capitalize`, reemplazado por JS: `title.charAt(0).toUpperCase() + title.slice(1)`
- Resultado correcto: "Viernes 15 de mayo"

#### 3. Banner GCal visible durante carga (flash indeseable para ISADI)
- **Archivo:** `src/app/(dashboard)/agenda/page.tsx`
- **Causa:** `usesNativeCalendar` defaul a `false` antes de cargar config del tenant → banner de Google Calendar aparecía ~2s al cargar la página, aunque ISADI usa calendario nativo
- **Fix:** Render condicional guarded con `!tenantConfigPending && !usesNativeCalendar`

#### 4. Hydration mismatch en AgentPromptEditor (React 19)
- **Archivo:** `src/components/configuracion/AgentPromptEditor.tsx`
- **Causa:** En segunda visita, TanStack Query tenía datos cacheados (`isPending=false` inmediato en cliente), pero SSR renderizaba skeleton. React 19 detectó la discordancia de estructura y lanzó error de hidratación
- **Fix:** Patrón `mounted` state — SSR y primer render cliente siempre muestran skeleton: `if (!mounted || isPending)`

#### 5–9. Bug sistémico: JWT claim `role` vs `app_role` (5 archivos)
- **Causa raíz:** En Supabase, `claims?.role` es el rol interno de Postgres (`'authenticated'`), NO el rol de la aplicación. El claim correcto es `claims?.app_role`, inyectado por `custom_access_token_hook`
- **Impacto:** Todos los checks de autorización que usaban `claims?.role !== 'admin'` fallaban silenciosamente — retornaban 403 incluso para admins válidos

| Archivo | Síntoma observable |
|---|---|
| `src/hooks/use-current-tenant.ts` | Sección Usuarios mostraba "Acceso denegado" a admins |
| `src/app/api/patients/route.ts` | POST /api/patients retornaba 403 (imposible crear pacientes) |
| `src/app/api/patients/[id]/route.ts` | PATCH /api/patients/[id] retornaba 403 (imposible editar pacientes) |
| `src/app/api/patients/[id]/deletion-request/route.ts` | POST deletion-request retornaba 403 |
| `src/app/api/usuarios/route.ts` | POST /api/usuarios retornaba 403 (imposible crear usuarios) |
| `src/app/api/usuarios/[userId]/route.ts` | PATCH /api/usuarios/[id] retornaba 403 (imposible activar/desactivar usuarios) |

- **Fix en todos:** `claims?.role` → `(claims?.app_role ?? claims?.role)` (patrón ya correcto en `useUserRole` — usado como referencia)

#### 10. Datos de mock duplicados en ServicesView.test.tsx
- **Archivo:** `src/components/configuracion/ServicesView.test.tsx`
- **Causa:** `INACTIVE_SERVICE` spread de `ACTIVE_SERVICE` sin override de `calendar_id` → ambos servicios mostraban `kin@cal.com` → `getByText(/Cal: kin@cal\.com/)` encontraba 2 elementos y fallaba
- **Fix:** Agregado `calendar_id: 'pilates@cal.com'` al mock del servicio inactivo

### QA visual — secciones verificadas

| Sección | Ruta | Estado |
|---|---|---|
| Dashboard / Inicio | `/dashboard` | ✅ OK |
| Bandeja de mensajes | `/dashboard/bandeja` | ✅ OK |
| Pacientes | `/dashboard/pacientes` | ✅ OK |
| Detalle de paciente | `/dashboard/pacientes/[id]` | ✅ OK |
| Agenda | `/dashboard/agenda` | ✅ OK (bugs 2+3 resueltos) |
| KPIs / Analytics | `/dashboard/kpis` | ✅ OK |
| Audit Trail | `/dashboard/audit` | ✅ OK |
| Config — Agente IA | `/dashboard/configuracion/agente` | ✅ OK (bug 4 resuelto) |
| Config — Servicios | `/dashboard/configuracion/servicios` | ✅ OK |
| Config — Profesionales | `/dashboard/configuracion/profesionales` | ✅ OK |
| Config — Horarios | `/dashboard/configuracion/horarios` | ✅ OK |
| Config — Usuarios | `/dashboard/configuracion/usuarios` | ✅ OK (bug 5 resuelto) |

### Resultado de tests

```
Tests antes del sprint: ~970 passing, 12 failing (pre-existentes)
Tests después del sprint: 1270 passing, 0 failing
```

Los 12 fallos pre-existentes correspondían exactamente a los bugs 5–10 documentados arriba (11 por claim JWT incorrecto en rutas API, 1 por datos de mock duplicados).

---

## Epic 9 — Módulo Calendario Nativo

**Estado:** done | **Período:** 2026-05-14/15 | **Stories:** 9.1–9.7 | **Tests finales:** ~970

### Story 9.1 — Migraciones: Tablas de Calendario Nativo

**Implementado:**
- 7 migraciones secuenciales: `professionals`, `service_professionals`, `professional_schedules`, `blocked_times`
- `ALTER TABLE patients ADD COLUMN preferred_professional_id UUID REFERENCES professionals`
- `ALTER TABLE appointments ADD COLUMN professional_id UUID REFERENCES professionals`
- `ALTER TABLE tenants ADD COLUMN uses_native_calendar BOOLEAN DEFAULT FALSE`
- Seed data ISADI: Patricia Pérez Bernal + Aldo Luque, service_professionals para Kinesiología/Fisioterapia/Rehabilitación, schedules Lun–Vie 08:00–18:00

**Decisiones técnicas:**
- `day_of_week` usa convención ISO (0=Lunes, 6=Domingo) en `professional_schedules` — difiere de `service_hours` donde 0=Domingo; se documentó la diferencia en el modelo
- `capacity_per_slot` en `services` ya existía — `professional_schedules` no lo repite
- Retrocompatibilidad garantizada via flag `uses_native_calendar`; `calendar_service.py` intacto para otros tenants
- Seed data aplica solo al tenant ISADI (`5298fcc5-15bf-494c-9655-b49d759cfef4`) via `WHERE tenant_id =`

---

### Story 9.2 — RLS Tablas Calendario Nativo

**Implementado:**
- RLS + FORCE ROW LEVEL SECURITY en `professionals`, `service_professionals`, `professional_schedules`, `blocked_times`
- Políticas SELECT: tenant aislado via `auth.jwt() ->> 'tenant_id'`
- Políticas INSERT/UPDATE/DELETE: solo admin O el propio profesional (match por email)
- `auth.email()` para identificar al profesional logueado

**Bug crítico (resuelto en 9.3):**
- Migraciones `20260516000008` y `20260516000009` usaron `auth.jwt() ->> 'role'` en lugar de `auth.jwt() ->> 'app_role'` — todas las operaciones de escritura habrían fallado silenciosamente en producción
- Fix aplicado en migración `20260516000012_fix_professionals_rls_write_claim.sql` (DROP + recrear las 6 políticas)

---

### Story 9.3 — CRUD Profesionales

**Implementado:**
- `ProfesionalesView` — listado con estado activo/inactivo visual, creación y edición inline
- `POST /api/profesionales` — crea professional + seed de service_professionals
- `PATCH /api/profesionales/[id]` — actualiza nombre/email, toggle `active`
- `GET /api/profesionales` — lista todos (admin) o solo el propio (doctor)
- Confirmación en 2 clicks para desactivar (guard contra desactivación accidental)

**Decisiones técnicas:**
- CR(9-3) retornó REJECTED Blocker por el bug de `role` vs `app_role` en las políticas RLS de 9.2; se relanzó DS tras aplicar la migración de fix
- Deactivate (soft delete) preferido sobre DELETE — preserva integridad referencial con `appointments.professional_id`

---

### Story 9.4 — Gestión de Horarios del Profesional

**Implementado:**
- `HorariosView` — tabla semanal Lun–Dom con rangos horarios por día
- `POST /api/profesionales/[id]/horarios` — crea `professional_schedules`
- `DELETE /api/profesionales/[id]/horarios/[scheduleId]` — elimina un rango
- `POST /api/profesionales/[id]/bloqueos` — crea `blocked_times` con `date_from`/`date_to`/`reason`
- `DELETE /api/profesionales/[id]/bloqueos/[blockId]`
- Validación server-side: `start_time < end_time`, solapamientos detectados antes del INSERT

**Decisiones técnicas:**
- No hay PATCH para horarios — se borra y recrea (inmutable por diseño, evita edge cases de solapamiento parcial)
- `blocked_times.reason` opcional — vacaciones, licencia o cualquier bloqueo sin etiqueta
- El profesional solo puede gestionar sus propios horarios (RLS via `auth.email()`)

---

### Story 9.5 — Vista "Mi Agenda"

**Implementado:**
- `/agenda/mi-agenda` — página exclusiva para el rol `doctor`
- `GET /api/appointments/mi-agenda` — filtra por `professional_id` via lookup de email en `professionals`
- Navegación por fecha via URL `?fecha=YYYY-MM-DD` (estado en URL, shareable)
- `AgendaDayView` reutilizado; sin filtros de profesional (ya está filtrado por identidad)
- Sidebar: entrada "Mi Agenda" visible solo para doctores

**Decisiones técnicas:**
- Lookup por email (no por UUID en JWT) — el JWT no incluye `professional_id`; el email es la llave de identidad del profesional en el dashboard
- Sin `preferred_professional_id` en esta vista — no aplica al doctor viendo sus propios turnos

---

### Story 9.6 — Vista Agenda General

**Implementado:**
- `/agenda` extendida para admins con `AgendaFilters` component
- `AgendaFilters` — selector de profesional + selector de servicio; ambos opcionales; botón "Limpiar"
- Filtros persistidos en URL params (`?professional=uuid&service=uuid`)
- `GET /api/appointments` extendido: acepta `professionalId` y `serviceId` como query params
- `useTenantConfig` hook — `GET /api/tenant/config` con 5min staleTime; fallback `false` on error
- Banners de GCal (`SyncStatusBanner`, `GCalDegradationBanner`) condicionales: solo se montan si `uses_native_calendar === false`; `useGCalChannelStatus` acepta parámetro `enabled`

**Decisiones técnicas:**
- Admin ve todos los profesionales; `uses_native_calendar` apaga los banners GCal globalmente
- Filtros opcionales y acumulativos — sin filtro = vista completa del tenant
- WCAG: `htmlFor` + `id` en todos los selects del filtro

---

### Story 9.7 — Deprecar GCal / Activar Calendario Nativo para ISADI

**Implementado:**
- Script SQL de activación: `UPDATE tenants SET uses_native_calendar = TRUE WHERE tenant_id = '5298fcc5...'`
- Guía de deprecación en docs: verificar seed data → aplicar script → verificar banners GCal desaparecen
- `calendar_service.py` marcado como legacy en comentario — no eliminado (retrocompatibilidad)
- Tests de integración: `uses_native_calendar = true` oculta banners GCal, `false` los muestra

**Decisiones técnicas:**
- Flag de tenant (no env var) — permite activación por tenant sin redeploy
- `calendar_service.py` se mantiene intacto — otros tenants hipotéticos podrían seguir usándolo
- No se eliminan las columnas `calendar_id` ni `calendar_event_id` en esta iteración — la limpieza queda para v2

---

## Epic 8 — Bugfixes, Calidad y Seguridad

**Estado:** done | **Período:** 2026-05-14/15 | **Stories:** 8.1–8.10 | **Tests finales:** ~900

### Story 8.1 — JWT RLS Críticos

**Implementado:**
- Migración `20260515000001_fix_jwt_claim_app_role.sql`: auth hook reescrito — emite `app_role` en lugar de `role` en los custom claims del JWT
- Helper `public.user_role()` actualizado para leer `app_role`
- `ALTER TABLE appointments ENABLE ROW LEVEL SECURITY; ALTER TABLE appointments FORCE ROW LEVEL SECURITY`
- 4 políticas RLS en `appointments`: SELECT/INSERT/UPDATE/DELETE filtradas por `tenant_id` via `app_role`
- Fix en `layout.tsx` línea 24: `claims?.role` → `(claims?.app_role ?? claims?.role)` — resolvió auto-logout crítico post-login

**Bug crítico resuelto:**
- Después de la migración del hook JWT, todos los usuarios eran redirigidos a `/login` inmediatamente tras autenticarse. El layout leía `claims?.role` pero el hook ahora emite `app_role`. El fallback `?? claims?.role` mantiene compatibilidad con sesiones activas previas a la migración.

**Decisiones técnicas:**
- `app_role` como nombre canónico del claim — evita colisión con el claim `role` de Supabase Auth interno
- `FORCE ROW LEVEL SECURITY` en `appointments` — aplica incluso al owner de la tabla (previene bypass accidental en funciones `SECURITY DEFINER`)

---

### Story 8.2 — Audit Logs: Admin, Usuarios y API Route

**Implementado:**
- `GET /api/usuarios` — nuevo handler admin-only; retorna `{ users }` desde `dashboard_users`; sin `.eq('tenant_id', ...)` (RLS filtra, AR14)
- `POST /api/usuarios` fix: `claims?.role` → `claims?.app_role`
- `use-user-management.ts` refactorizado: reemplaza query Supabase directa del browser por `fetch('/api/usuarios')`; optimistic update con rollback (`previousUsers` capture)
- Migración `20260515000005_audit_logs_admin_only_select.sql`: SELECT en `audit_logs` restringido a `app_role = 'admin'`

**Decisiones técnicas:**
- Componentes/hooks NUNCA acceden a Supabase browser en tablas con datos sensibles de gestión — solo via API Routes (AR15)
- Rollback optimista: `queryClient.setQueryData(key, previousUsers)` en `onError`

---

### Story 8.3 — Realtime con Filtro de Tenant

**Implementado:**
- `use-conversations-realtime.ts`: `useState(false)` (no `true`) para `isConnected`; `filter: tenant_id=eq.${tenantId}` en `postgres_changes`
- `use-agenda-realtime.ts`: `filter: tenant_id=eq.${tenantId}`; `exact: false` en `invalidateQueries` para invalidar queries con variantes de filtro
- Migración `20260515000004_realtime_replica_identity.sql`: `REPLICA IDENTITY FULL` en `appointments` y `thread_states`; ADD TABLE a `supabase_realtime` publication
- Migración `20260515000006_conversations_replica_identity.sql`: `REPLICA IDENTITY FULL` en `conversations`

**Decisiones técnicas:**
- Sin `filter` en Realtime: todos los eventos del servidor llegan a todos los tenants conectados — violación de aislamiento
- `exact: false` en invalidation: necesario cuando el queryKey incluye filtros opcionales (profesional, servicio) que pueden variar
- `REPLICA IDENTITY FULL`: requerido para que Supabase Realtime incluya el `tenant_id` en el payload de eventos UPDATE/DELETE

---

### Story 8.4 — Timezone, DnD y Modales de Agenda

**Implementado:**
- `NewTurnoModal`: timestamps con offset `-03:00` explícito; `toLocaleDateString('en-CA')` para atributo `min` del date input
- `RescheduleTurnoModal`: `useEffect` con `appointment_id` como dependencia para resetear el formulario al cambiar de turno
- `CalendarView`: guard para estados `cancelled`/`no_show` en `handleEventDrop` (bloquea DnD para turnos no reprogramables)
- Banners de GCal movidos de `CalendarView` a `agenda/page.tsx` — componente de agenda es presentacional puro

**Decisiones técnicas:**
- Offset `-03:00` hardcodeado (Buenos Aires, sin DST) — suficiente para ISADI; timezone dinámica queda para v2
- `useEffect` reset dependiente de `appointment_id` — evita que el formulario muestre datos del turno anterior al abrir para un turno diferente

---

### Story 8.5 — Métricas, Loading y Pagination

**Implementado:**
- Skeleton loaders en vistas de KPIs y analytics que no los tenían
- Pagination en listados de pacientes y conversaciones (limit/offset via query params)
- `GET /api/audit-logs` — paginación con `range()` de Supabase; retorna `{ data, count, total_pages }`
- Loading states con `isPending` (TanStack Query v5) en formularios de submit

**Decisiones técnicas:**
- TanStack Query v5: `isLoading` vs `isPending` — `isLoading = isPending && !hasData`; usar `isPending` en formularios
- Pagination server-side (Supabase `range()`) — no client-side para audit logs (tabla grande)

---

### Story 8.6 — Seguridad en API Routes

**Implementado:**
- Validación de auth en todas las API Routes: `getUser()` + extracción de `tenant_id` y `app_role` del JWT antes de cualquier operación
- `FastAPIClient` — wrapper server-side para llamadas al backend Python; `FASTAPI_BASE_URL` nunca expuesto al browser
- Rate limiting básico via headers de Supabase (documentado, no implementado a nivel app)
- Inputs sanitizados: UUID validation antes de queries; `z.string().uuid()` en schemas de request

**Decisiones técnicas:**
- `parseJwtPayload` en todas las routes — no confiar en cookies o body para `tenant_id`
- `admin.ts` (Supabase service role) solo importable desde API Routes y lib server-side (AR15)

---

### Story 8.7 — Cache, PATCH 404 y Último Mensaje

**Implementado:**
- Migración `20260515000007_get_latest_messages_rpc.sql`: función `get_latest_messages_by_phone` con `DISTINCT ON (phone_number)` + `SECURITY DEFINER`
- `GET /api/conversations` extendido: incluye `last_message` via RPC en lugar de subquery ineficiente
- `PATCH /api/appointments/[id]`: fix 404 cuando el turno no pertenece al tenant — ahora retorna 403 con mensaje claro
- Cache headers en responses de lectura: `Cache-Control: private, max-age=0` para responses con datos de sesión

**Decisiones técnicas:**
- `DISTINCT ON` + `ORDER BY phone_number, created_at DESC` — patrón eficiente PostgreSQL para "el más reciente por grupo"
- `SECURITY DEFINER` en la RPC — ejecuta con permisos del owner, RLS del llamador no aplica; la función valida `tenant_id` internamente

---

### Story 8.8 — Error Boundaries y Security Headers

**Implementado:**
- `src/app/(dashboard)/error.tsx`: error boundary con `unstable_retry()` (API de Next.js 16.2.4)
- `src/app/global-error.tsx`: global error boundary con `<html>` y `<body>` propios
- `next.config.ts`: security headers vía `headers()` async function — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP con `frame-ancestors 'none'`

**Decisiones técnicas:**
- `unstable_retry()` disponible en Next.js 16.2.4 — permite al usuario reintentar sin reload completo
- CSP permisivo en desarrollo (script-src incluye `'unsafe-eval'` para Turbopack) — restringido en producción
- `global-error.tsx` requiere `<html>`/`<body>` propios porque reemplaza el root layout en errores críticos

---

### Story 8.9 — WhatsApp History Fix

**Implementado:**
- `WhatsAppHistory.tsx` refactorizado: usa `phoneNumber` directamente en lugar de UUID de Chatwoot
- Split en `WhatsAppHistory` (outer, con condicional) + `WhatsAppHistoryInner` (inner, hooks sin condicional) — evita violación de reglas de hooks
- `GET /api/chatwoot/conversations/[conversation_id]/messages`: heurística `/^\+?\d{9,}$/` para detectar phone numbers y resolver a `conversation_id` via `contacts/search` de Chatwoot
- Manejo de `conversation_id` inexistente: retorna `{ messages: [] }` en lugar de 404

**Decisiones técnicas:**
- El `conversation_id` en Chatwoot no coincide con el UUID de conversación de la DB — la resolución via phone es más robusta
- Split de componente necesario porque hooks no pueden llamarse condicionalmente (Rules of Hooks)

---

### Story 8.10 — Calidad TypeScript y Logger

**Implementado:**
- `src/lib/logger.ts` — logger JSON estructurado server-side: `logger.info/warn/error({ context }, message)`
- Logger adoptado en todas las API Routes que tenían `console.log/error`
- TypeScript strict fixes: eliminación de `any` implícitos, `as unknown as T` donde necesario, tipos explícitos en generics de TanStack Query
- `vitest.config.ts`: `pool: 'vmThreads'` + `maxWorkers: 2` — resuelve timeout en fork mode sobre filesystem externo con espacios en el path

**Decisiones técnicas:**
- Logger server-side only (`'server-only'` import guard) — nunca bundleado al cliente
- `vmThreads` vs `forks`: el path con espacios y corchetes en el filesystem USB causaba que los workers forkeados fallaran al resolver módulos; `vmThreads` usa workers de Node en el mismo proceso
- `maxWorkers: 2` conservador — el filesystem USB tiene I/O lento; más workers = más contención

---

## Epic 2 — Agenda del Día en Tiempo Real

**Estado:** done | **Período:** 2026-05-08 | **Stories:** 2.1–2.7 | **Tests finales:** 162

### Story 2.1 — Vista de Agenda del Día por Servicio y Profesional

**Implementado:**
- `AgendaDayView` — lista agrupada por profesional con `TurnoCard`
- `useAppointments(date)` — hook compartido con `useList` de Refine + Supabase
- `useAgendaRealtime(date)` — Supabase Realtime con cleanup correcto
- `AgendaDayViewSkeleton` — skeleton de carga de 5 filas

**Decisiones técnicas:**
- `parseISO` + `isValid` para guard de fechas inválidas en `TurnoCard` (fallback `--:--`)
- Refine `useList` con `meta.select: '*'` incluye `calendar_event_id` automáticamente
- `AgendaDayView` recibe props (`appointments`, `isLoading`, `isError`) — sin `useList` interno

**Patches aplicados post code-review (10 correcciones):**
- `StatusDot`: `default: return 'inactive'` en switch para safety en runtime
- `providers.tsx`: `useState(() => createSupabaseBrowserClient())` para instancia estable (useRef rechazado por ESLint `react-hooks/refs`)
- `package.json`: `server-only` movido de devDependencies a dependencies
- `TurnoCard`: `isValid(parseISO(...))` guard + fallback `'--:--'`
- `AgendaDayView`: null guard `result?.data ?? []`; skeleton rediseñado a forma 4-columnas
- `agenda/page.tsx`: deduplicación de imports date-fns; `parseValidDate()` con regex+isValid; `min-w-[44px]` en botón "Hoy"

**Deuda diferida:** join null de `services` agrupa igual que "sin profesional"; colores hex hardcodeados en `StatusDot`

---

### Story 2.2 — Strip Superior de KPIs del Día

**Implementado:**
- `KPIStrip` — 5 cards: Total, Confirmados, Cancelados, No-shows, Pendientes
- `KPIStripSkeleton` — skeleton de carga
- Cómputo client-side desde props (no query adicional)
- Grid responsive: `grid-cols-2 sm:grid-cols-5`

---

### Story 2.3 — Creación Manual de Turno por DNI y Slot Disponible

**Implementado:**
- `NewTurnoModal` — modal multi-step con `@base-ui/react/dialog`
- `GET /api/patients/search?dni=` — búsqueda por DNI con `.maybeSingle()`
- `POST /api/appointments` — creación con `start_at`/`end_at`, `booked_via: 'manual'`, `calendar_event_id: null`
- `supabase/migrations/20260508_004_dashboard_users_admin_rls.sql` — columnas `full_name`, `email` + 3 políticas RLS

**Decisiones técnicas clave:**
- `standardSchemaResolver` (NO `zodResolver`) — incompatible con Zod v4.4.3
- `@base-ui/react/dialog` — shadcn dialog.tsx no estaba instalado
- `tenant_id` extraído del JWT server-side — nunca del body del cliente
- Conflicto 23505 (unique constraint) → 409 para el cliente

**Bug evitado:** primer intento del agente DS(2.3) usó Supabase MCP para schema → se relanzó el agente con restricción explícita de leer migraciones locales

---

### Story 2.4 — Reprogramación de Turno con Drag-and-Drop

**Implementado:**
- `CalendarView` — `withDragAndDrop(Calendar)` de react-big-calendar, vista Day
- `dateFnsLocalizer` con locale `es`
- Optimistic update en `setLocalEvents` + `revertDrop()` en cancelar/error
- `CustomEvent` con botón Pencil accesible (`aria-label`)
- `RescheduleConfirmModal` — modal de confirmación post-drop
- `RescheduleTurnoModal` — alternativa accesible sin DnD
- `PATCH /api/appointments/[id]` — actualiza `start_at`/`end_at`, llama `logAudit('appointment_rescheduled')`
- `src/test/__mocks__/styleMock.ts` — mock CSS para react-big-calendar en Vitest

**Decisiones técnicas:**
- `status` NO cambia a `'rescheduled'` — no está en el CHECK constraint de la DB
- `await params` en `[id]/route.ts` — Next.js 16 params es una Promise
- `CalendarEvent` type nuevo que mapea `start_at`/`end_at` → `Date` para react-big-calendar
- Orden de CSS imports crítico para react-big-calendar

**Bug pre-existente encontrado en CR(2.4):** `use-appointments.ts` filtraba por `appointment_time` (campo legacy TS, no existe en DB) → corregido a `start_at`

**Hallazgos en code review (no bloqueantes):**
- Indicador visual "pendiente drop" en `eventPropGetter` no implementado — modal bloquea UI inmediatamente, aceptable para MVP
- `professional` vs `professional_name` — inconsistencia pre-existente

---

### Story 2.5 — Estado de Sincronización Dashboard → Google Calendar con Reintentos

**Implementado:**
- `SyncStatusBanner` — banner inline con botón "Sincronizar ahora"; detecta `calendar_event_id IS NULL`
- `POST /api/appointments/sync` — proxy server-side hacia FastAPI `/api/v1/appointments/sync`
- Invalidación de `['agenda', 'day', isoDate]` tras sync exitosa
- 7 tests nuevos (127 total)

**Decisiones técnicas:**
- Estado de sync detectado puramente desde DB (`calendar_event_id IS NULL`) — sin campo `sync_status` adicional
- Retry/backoff vive en FastAPI (RQ) — el dashboard solo dispara y representa estado
- Stub 200 si `FASTAPI_BASE_URL` no disponible — permite desarrollar sin backend

**Fixes en implementación:**
- Double `success` key: `{ success: true, ...result }` → `{ ...result, success: true }` (TypeScript strict)
- `FastAPIError` cast: `err as { ... }` → `(err as unknown) as { ... }` (strict mode)
- Tests: `getAllByText('Sincronizando...')` en lugar de `getByText` (texto aparece en span y botón simultáneamente)

---

### Story 2.6 — Cambios Externos de Google Calendar Reflejados en Tiempo Real

**Implementado:**
- **Corrección crítica bug:** `use-agenda-realtime.ts` usaba `appointment_time` (campo legacy TS) en el filtro de fecha — el payload de Supabase Realtime devuelve columnas reales de la DB. Cambiado a `start_at`. Sin la corrección, el filtro siempre era `undefined` y la query se invalidaba ante cualquier cambio del tenant (ineficiente y violaba el AC de invalidación selectiva por fecha).
- `GCalDegradationBanner` — banner informativo sin botón de acción cuando el canal push GCal está degradado
- `useGCalChannelStatus` — hook de polling pasivo cada 5 min hacia `GET /api/gcal/channel-status`
- `GET /api/gcal/channel-status` — proxy hacia FastAPI; retorna `healthy | degraded | unknown`
- 16 tests nuevos (143 total)

**Decisiones técnicas:**
- El dashboard NO recibe webhooks de GCal — FastAPI es el receptor. El dashboard es consumidor reactivo via Supabase Realtime
- Polling cada 5 min (no Supabase Realtime) para el estado del canal — el estado cambia raramente
- `GCalDegradationBanner` sin botón — FastAPI gestiona la renovación automáticamente
- Si FastAPI no disponible: stub retorna `{ status: 'healthy' }` para no mostrar banners en dev

**Desafío técnico en tests:** `AbortSignal.timeout` + fake timers en jsdom requirió stub de `AbortSignal.timeout` y `advanceTimersByTime` + promise flushes (en lugar de `runAllTimersAsync` que causaba loop infinito)

---

### Story 2.7 — Utilidad Server-side de Soft-Sync Pasivo de Turnos

**Implementado:**
- `POST /api/appointments/soft-sync` — API Route que valida sesión, extrae `tenant_id` del JWT, valida `patient_id` UUID, llama FastAPI, mapea 202/200/404/5xx
- `useSoftSync()` — hook `'use client'` con `trigger(patientId)` + `status: SoftSyncStatus`
- Fire-and-forget por diseño — no bloquea la UI que lo invoque (NFR4: ficha interactiva en <2s)
- Invalida `['agenda', 'day', date]` por cada `affected_date` en la respuesta si FastAPI los retorna
- 19 tests nuevos (162 total)

**Decisiones técnicas:**
- API Route dedicada (no proxy genérico `/api/fastapi/[...path]`) — necesita validación UUID y manejo específico de 404 (`not_found`, no error)
- `tenant_id` inyectado desde JWT — nunca del body del cliente
- `affected_dates` es opcional — si FastAPI no lo implementa, `useAgendaRealtime` cubre los cambios via Supabase Realtime
- Contrato documentado para consumo en Story 3.4 (ficha del paciente)

**Nota de tests:** `vi.hoisted()` necesario para declarar mocks antes del hoisting de Vitest cuando los factory referencian variables usadas en múltiples `vi.mock()`

---

## Epic 1 — Fundación del Proyecto

**Estado:** done | **Período:** 2026-05-04 a 2026-05-08 | **Stories:** 1.1–1.6

### Story 1.1 — Inicialización del Proyecto y Sistema de Diseño Base

- `create-next-app@latest` + setup manual de Tailwind v4, shadcn/ui, Refine v5
- Design tokens en CSS variables (`--color-*`, `--radius-*`)
- Decisión: `create-refine-app` descartado por bug #7165 (localStorage SSR 500)

### Story 1.2 — Autenticación con Email/Contraseña y JWT con Custom Claims

- `middleware.ts` — Edge Middleware con validación de sesión Supabase
- Login form con react-hook-form + Zod
- JWT custom claims: `tenant_id`, `user_role` vía Supabase Auth hooks

### Story 1.3 — Middleware Edge, Control de Acceso por Rol y Navegación Base

- RBAC via `accessControlProvider` de Refine + RLS en Supabase (doble capa independiente)
- Sidebar con rutas protegidas por rol
- `(dashboard)` route group con layout compartido

### Story 1.4 — Infraestructura de Audit Trail

- `logAudit()` en `src/lib/audit.ts` — append-only, service role client
- Tabla `audit_logs` con `tenant_id`, `actor_id`, `action`, `metadata`, `created_at`

### Story 1.5 — Gestión de Usuarios del Tenant

- Tabla `dashboard_users` con `full_name`, `email`, `role`, `is_active`
- `POST /api/usuarios` — `inviteUserByEmail` via service role + insert en `dashboard_users`
- `PATCH /api/usuarios/[userId]` — toggle `is_active` con `await params` (Next.js 16)
- Migración `20260508_004_dashboard_users_admin_rls.sql` — 3 políticas RLS via `public.tenant_id()` / `public.user_role()`

### Story 1.6 — Docker, EasyPanel y Health Check de Producción

- Dockerfile 3-stage: deps/builder/runner (Node 20 Alpine)
- `output: 'standalone'` en `next.config.ts`
- `GET /api/health` — endpoint para health check de EasyPanel
- `.env.example` con las 6 variables requeridas
- Usuario non-root `nextjs` en el container
