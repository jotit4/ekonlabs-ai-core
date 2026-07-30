# Arquitectura Técnica — ekonlabs Dashboard

Decisiones de diseño, patrones establecidos y convenciones que guían el desarrollo. Leer antes de escribir código nuevo.

## Principios fundamentales

1. **Brownfield puro:** el dashboard consume el backend existente (FastAPI + Supabase). No implementa lógica de negocio.
2. **Server-side secrets:** `FASTAPI_BASE_URL`, `FASTAPI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` nunca llegan al browser. Solo API Routes.
3. **No Server Actions:** toda mutación server-side va via API Routes (`src/app/api/**`). No `'use server'`.
4. **RLS como enforcement real:** Supabase Row Level Security es la capa de autorización en DB. No agregar `.eq('tenant_id', ...)` en queries con cliente autenticado — RLS filtra automáticamente.
5. **Hooks = orquestadores, no fuentes de datos:** los hooks reactivos (`useAgendaRealtime`, `useGCalChannelStatus`) solo invalidan queries — no devuelven datos propios. Los datos vienen de `useAppointments` (TanStack Query).

---

## Auth y multi-tenancy

### Flujo de autenticación

```
Login (email/password)
  → Supabase Auth emite JWT con custom claims: { tenant_id, user_role }
  → middleware.ts (Edge): valida JWT en cada request a /dashboard/**
  → Si inválido → redirect /login
  → Si válido → request continúa con cookies de sesión
```

### Extracción de tenant_id en API Routes

```typescript
// Patrón estándar — SIEMPRE extraer del JWT, NUNCA del body del cliente
const supabase = await createSupabaseServerClient()
const { data: { user } } = await supabase.auth.getUser()
const { data: { session } } = await supabase.auth.getSession()

if (!user || !session) return Response.json({ error: 'No autorizado' }, { status: 401 })

const claims = parseJwtPayload(session.access_token)
const tenantId = claims?.tenant_id as string | undefined
```

### Clientes Supabase

| Contexto | Cliente | Importar desde |
|---------|---------|---------------|
| Componentes `'use client'` | `createSupabaseBrowserClient()` | `@/lib/supabase/client` |
| API Routes, Server Components | `createSupabaseServerClient()` (async) | `@/lib/supabase/server` |
| Admin (invitaciones) | `createSupabaseAdminClient()` | `@/lib/supabase/admin` — NUNCA desde componentes/hooks |

---

## API Routes — patrón proxy FastAPI

Todas las API Routes que proxian a FastAPI siguen el mismo patrón:

```typescript
// src/app/api/appointments/soft-sync/route.ts — ejemplo canónico
import { FastAPIClient } from '@/lib/fastapi/client'

const fastapi = new FastAPIClient(
  process.env.FASTAPI_BASE_URL!,
  process.env.FASTAPI_API_KEY!,
)

export async function POST(request: Request) {
  // 1. Auth — siempre primero
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

  // 2. tenant_id del JWT — nunca del body
  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id

  // 3. Stub dev si FastAPI no disponible
  if (!process.env.FASTAPI_BASE_URL) {
    return Response.json({ status: 'pending' }, { status: 202 })
  }

  // 4. Llamar FastAPI (server-side)
  try {
    const result = await fastapi.request<T>('/api/v1/...', { method: 'POST', body: ... })
    return Response.json(result, { status: 200 })
  } catch (err) {
    // FastAPIError (4xx/5xx de FastAPI) o AbortError (timeout 5s)
    return Response.json({ error: 'unavailable' }, { status: 503 })
  }
}
```

**FastAPIClient** (`src/lib/fastapi/client.ts`):
- `client.request<T>(path, init?)` — lanza `FastAPIError` (`.status`, `.body`) en respuestas no-OK
- Timeout de 5s via `AbortSignal.timeout(5000)` — cumple NFR23

---

## Supabase Realtime — patrón de hooks reactivos

```typescript
// src/hooks/use-agenda-realtime.ts — patrón canónico
export function useAgendaRealtime(isoDate: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel(`appointments-changes-${isoDate}`)  // nombre único por fecha
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => {
          // Filtrar por fecha usando columnas REALES de la DB (no campos legacy del tipo TypeScript)
          const affectedTime = payload.new?.start_at ?? payload.old?.start_at
          if (affectedTime && affectedTime.slice(0, 10) !== isoDate) return
          // Solo invalidar — nunca devolver datos desde este hook
          queryClient.invalidateQueries({ queryKey: ['agenda', 'day', isoDate] })
        })
      .subscribe()

    return () => { supabase.removeChannel(channel) }  // cleanup OBLIGATORIO
  }, [isoDate, queryClient])
}
```

**Reglas:**
- AR11: hooks de Realtime no devuelven datos — solo invalidan queries
- AR12: datos siguen viniendo de `useList`/`useOne` de Refine
- AR13: `removeChannel()` SIEMPRE en el `return` del `useEffect`
- Usar columnas reales de DB en filtros de payload — no campos legacy del tipo TypeScript

---

## Formularios

```typescript
// Patrón correcto — standardSchemaResolver (Zod v4 compatible)
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { z } from 'zod'

const schema = z.object({ ... })
const form = useForm({ resolver: standardSchemaResolver(schema) })
```

**NUNCA** usar `zodResolver` de `@hookform/resolvers/zod` — incompatible con Zod v4.4.3.

---

## Modales

Usar `@base-ui/react/dialog` — shadcn `dialog.tsx` no está instalado en este proyecto.

---

## TanStack Query keys

Formato obligatorio: `[feature, operation, ...params]`

| Key | Uso |
|-----|-----|
| `['agenda', 'day', isoDate]` | Appointments del día |
| `['agenda', 'kpis', isoDate]` | KPIs de la franja horaria |

---

## DB Schema — notas críticas

### Tabla `appointments`
- Columna de tiempo de inicio: `start_at` (TIMESTAMPTZ) — **no** `appointment_time` (ese es un campo legacy del tipo TypeScript, no existe en la DB)
- `calendar_event_id TEXT` — `NULL` si pendiente de sync con GCal; NOT NULL si sincronizado
- `status CHECK IN ('confirmed', 'cancelled', 'completed', 'no_show')` — `'rescheduled'` no está en el CHECK constraint
- `booked_via CHECK IN ('whatsapp', 'manual', 'web')`

### RLS
- El cliente autenticado de Supabase ya filtra por `tenant_id` via RLS
- **No agregar** `.eq('tenant_id', tenantId)` en queries — RLS lo hace solo (AR14)

---

## Estructura de query keys y sus hooks

| Hook | Query key | Invalida cuando |
|------|-----------|-----------------|
| `useAppointments(date)` | `['agenda', 'day', date]` | — |
| `useAgendaRealtime(date)` | Invalida `['agenda', 'day', date]` | Supabase Realtime detecta cambio en `appointments` |
| `SyncStatusBanner` | Invalida `['agenda', 'day', date]` | Tras POST sync exitoso |
| `useSoftSync.trigger()` | Invalida `['agenda', 'day', date]` por cada `affected_date` | Tras POST soft-sync con `affected_dates` en response |

---

## Arquitectura de componentes — Agenda

```
AgendaView
├── useAppointments / useAppointmentsRange  → turnos del rango visible
├── useDayStatusRange                       → feriados + decisión abre/cierra
├── AgendaFilters / AgendaServiceButtons    → filtros y grupos de recepción
├── CalendarView                            → vista Día
├── CalendarViewRangeReadOnly
│   ├── WeekGridView + TurneroGrid          → grilla hora × día
│   └── react-big-calendar (Mes)            → resumen compacto + modal diario
├── NewTurnoModal                           → turno único o serie 5/10
├── NewPaqueteModal                         → alta de bono + scheduler opcional
├── TurnoDetailModal                        → detalle/estado del turno
└── DayStatusModal                          → decisión operativa de feriados/cierres
```

### Disponibilidad y grupos de recepción

- `GET /api/availability` acepta `service_id` o `service_ids` separados por coma.
- Sin `professional_id`, el endpoint resuelve todos los profesionales activos de cada servicio y une los huecos sin perder `service_id`/`professional_id`.
- `services.reception_group` clasifica servicios para los botones operativos de recepción (`fisioterapia`, `pileta`, `pilates`).
- En el turno simplificado de recepción, la UI deduplica por hora; el slot elegido conserva internamente el servicio y profesional reales.
- En paquetes sin profesional fijo, `AvailabilitySlotPicker` también deduplica por hora, pero la identidad de selección es fecha+hora+profesional.
- `include_elapsed_today=true` selecciona la RPC aislada `check_reception_availability`: solo el rol `receptionist` puede ver slots con cupo ya transcurridos del día actual de Buenos Aires. La RPC estándar conserva `> NOW()`.
- En series x5/x10 de Recepción, `NewTurnoModal` exige el servicio activo exacto `Fisioterapia`, crea el paquete sin profesional fijo y persiste en cada sesión el `professional_id` real elegido por disponibilidad.

### Paquetes y propuesta automática

- `MultiSessionScheduler` es controlado: no crea turnos hasta confirmar desde el contenedor.
- Elegir la primera sesión dispara la propuesta de las restantes según cadencia y disponibilidad real.
- Una fecha sin el mismo horario queda pendiente y editable; nunca se fabrica un slot.
- `POST /api/treatments/[id]/sessions` recibe los slots finales, valida el cupo disponible y crea la tanda.

### Vista Mes

- El mes es una vista de resumen: cada turno muestra sólo hora y paciente.
- React Big Calendar limita filas (`showAllEvents=false`) y el excedente abre `DayEventsModal` con el día completo.
- El fondo de una fecha del mes seleccionado es clickeable; las fechas grises adyacentes son inertes porque no están en el rango consultado.
- Los eventos mantienen click propio y acceso por teclado mediante `eventWrapper`.

---

## Tests

Configuración: Vitest 4.1.5 + Testing Library + jsdom

```bash
pnpm test           # run all tests
pnpm test:watch     # watch mode
```

**Mocks importantes:**
- `src/test/__mocks__/styleMock.ts` — mock de CSS para react-big-calendar (necesario en jsdom)
- `src/test/setup.ts` — setup global (cleanup after each)
- Para `AbortSignal.timeout` en tests de hooks: stub via `vi.stubGlobal`
- Para `createSupabaseServerClient` en tests de API Routes: `vi.mock('@/lib/supabase/server')`

**Tests co-locados:** cada archivo de implementación tiene su `.test.ts` / `.test.tsx` en la misma carpeta.

---

## Convenciones de código

| Convención | Detalle |
|-----------|---------|
| TypeScript strict | Sin `any` — usar `unknown` o tipos específicos |
| Fechas | `date-fns/format` — nunca `toLocaleDateString()` o `toLocaleTimeString()` |
| Package manager | `pnpm` exclusivamente |
| Comentarios | Solo cuando el WHY es no obvio — no comentar QUÉ hace el código |
| Imports admin | `admin.ts` solo en API Routes — nunca en componentes ni hooks (AR15) |

---

## Deuda técnica documentada

Ver [`_bmad-output/implementation-artifacts/deferred-work.md`](../_bmad-output/implementation-artifacts/deferred-work.md) para la lista completa de deuda técnica diferida de cada code review.

Puntos de mayor impacto:
- `FastAPIClient` instanciado a nivel de módulo con `!` non-null assertion cuando `FASTAPI_BASE_URL` puede ser `undefined` en test/dev (Medium — guards stub previenen el bug en runtime)
- `StatusDot` con colores hex hardcodeados — no responde a dark mode (Low — pendiente cuando se implemente dark mode)
- Sin error boundary alrededor de `AgendaDayView` (Medium — agregar en Epic 3)
