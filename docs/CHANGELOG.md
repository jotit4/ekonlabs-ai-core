# Changelog de Implementación

Registro de trabajo por Epic/Story — decisiones técnicas, hallazgos de code review y bugs resueltos.

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
