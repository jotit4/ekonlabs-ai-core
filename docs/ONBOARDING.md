# Onboarding — ekonlabs Dashboard

Guía de incorporación para desarrolladores nuevos al proyecto.

## Contexto del proyecto

El dashboard es la interfaz operativa del sistema de agente IA de ekonlabs para clínicas. El backend (FastAPI + LangGraph + Supabase) ya existe — este repo es el frontend Next.js que lo consume.

**Usuario de referencia:** Valentina, recepcionista de ISADI (clínica médica), quien usa el dashboard para:
- Ver la agenda del día sincronizada con Google Calendar
- Crear y reprogramar turnos
- Supervisar las conversaciones del agente de WhatsApp
- Controlar el takeover del agente cuando escala una conversación

## Setup inicial

### Prerequisitos

- Node.js 20+
- pnpm 9+
- Acceso a las credenciales de Supabase (pedir al owner del proyecto)

### Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/jotit4/ekonlabs-ai-core.git
cd ekonlabs-ai-core
git checkout ekonlabs-dashboard

# 2. Instalar dependencias (solo pnpm — no usar npm ni yarn)
pnpm install

# 3. Configurar entorno
cp .env.example .env.local
```

### Variables de entorno en `.env.local`

```bash
# Supabase — proyecto zgknmifmeoacravtskbx
NEXT_PUBLIC_SUPABASE_URL=https://zgknmifmeoacravtskbx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<pedir al owner>
SUPABASE_SERVICE_ROLE_KEY=<pedir al owner — nunca commitear>

# FastAPI backend — puede quedar vacío en dev (las API Routes tienen stubs)
FASTAPI_BASE_URL=http://localhost:8000
FASTAPI_API_KEY=<pedir al owner>

# Chatwoot — solo necesario para Epic 4
# CHATWOOT_ACCESS_TOKEN=
```

> Si `FASTAPI_BASE_URL` está vacío, las API Routes que proxian a FastAPI retornan respuestas stub (200/202) — podés desarrollar sin el backend corriendo.

### Levantar el servidor

```bash
pnpm dev
# → http://localhost:3000
```

La app redirige a `/login`. Usar credenciales del tenant ISADI (pedir al owner).

## Comandos esenciales

```bash
pnpm dev          # Desarrollo (hot reload)
pnpm build        # Build de producción
pnpm start        # Servir build de producción
pnpm test         # Tests (Vitest) — correr antes de cada PR
pnpm test:watch   # Tests en modo watch durante desarrollo
pnpm lint         # ESLint — correr antes de cada PR
```

## Estructura del proyecto

```
ekonlabs-dashboard/
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/            # Rutas públicas: /login
│   │   ├── (dashboard)/       # Rutas protegidas por middleware
│   │   │   ├── agenda/        # /agenda — vista del día
│   │   │   └── usuarios/      # /usuarios — gestión de team
│   │   └── api/               # API Routes (server-side, no expuestas al browser)
│   │       ├── appointments/  # POST crear, PATCH reprogramar, POST sync, POST soft-sync
│   │       ├── gcal/          # GET channel-status
│   │       ├── health/        # Health check para Docker
│   │       ├── patients/      # GET search por DNI
│   │       └── usuarios/      # POST invitar, PATCH toggle activo
│   ├── components/
│   │   ├── agenda/            # Todos los componentes de la vista de agenda
│   │   ├── auth/              # Formulario de login
│   │   ├── shared/            # StatusDot y otros reutilizables
│   │   └── usuarios/          # Tabla y formularios de usuarios
│   ├── hooks/                 # Custom hooks ('use client')
│   ├── lib/
│   │   ├── fastapi/           # FastAPIClient — solo usar en API Routes
│   │   ├── supabase/          # client.ts (browser) + server.ts (server) + admin.ts
│   │   └── utils/             # jwt.ts (parseJwtPayload)
│   ├── test/
│   │   ├── setup.ts           # Vitest setup global
│   │   └── __mocks__/         # CSS mock para react-big-calendar
│   └── types/
│       └── appointments.ts    # Tipos del dominio (Appointment, AppointmentStatus...)
├── supabase/
│   └── migrations/            # Migraciones SQL — fuente de verdad del schema DB
├── docs/                      # Esta carpeta
├── .env.example               # Template de variables de entorno
├── Dockerfile                 # Multi-stage build para producción
├── AGENTS.md                  # Advertencia crítica sobre Next.js 16
└── CLAUDE.md                  # Config de Claude Code
```

## Patrones críticos a conocer

### 1. Clientes Supabase — cuál usar y dónde

| Contexto | Cliente |
|---------|---------|
| Componente React (`'use client'`) | `createSupabaseBrowserClient()` de `@/lib/supabase/client` |
| API Route, Server Component | `await createSupabaseServerClient()` de `@/lib/supabase/server` |
| Admin (invitar usuarios) | `createSupabaseAdminClient()` — SOLO en API Routes |

### 2. RLS — no duplicar el filtrado

Supabase RLS ya filtra por `tenant_id` cuando el usuario está autenticado. **No agregar** `.eq('tenant_id', tenantId)` en queries — es redundante y rompe cuando se cambia la estrategia de RLS.

### 3. Formularios — resolver correcto

```typescript
// CORRECTO
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'

// MAL — incompatible con Zod v4
import { zodResolver } from '@hookform/resolvers/zod'
```

### 4. Fechas en la DB

La columna real en `appointments` es `start_at` (TIMESTAMPTZ). El tipo TypeScript tiene un campo legacy `appointment_time` que mapea a `start_at` — **nunca usar `appointment_time` en filtros de queries o en payloads de Supabase Realtime**, ya que ese campo no existe en la DB real.

### 5. `tenant_id` en API Routes

Siempre extraer del JWT, nunca del body del cliente:

```typescript
const claims = parseJwtPayload(session.access_token)
const tenantId = claims?.tenant_id
```

### 6. Secrets de FastAPI

`FASTAPI_BASE_URL` y `FASTAPI_API_KEY` son server-only. Las API Routes los usan via `FastAPIClient`. Nunca deben aparecer en componentes o hooks cliente.

### 7. Next.js 16 — params en rutas dinámicas

```typescript
// CORRECTO en Next.js 16
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params  // params es una Promise en Next.js 16
}
```

## Tests

Vitest 4.1.5 + Testing Library + jsdom.

Los tests están **co-locados** con los archivos que testean:
```
src/components/agenda/SyncStatusBanner.tsx
src/components/agenda/SyncStatusBanner.test.tsx  ← mismo directorio
```

### Correr tests

```bash
pnpm test              # todos los tests (baseline 2026-07-16: 2913 passing)
pnpm test:watch        # watch mode
pnpm test src/hooks    # solo tests de hooks
```

### Mocks importantes

- **CSS de react-big-calendar:** `src/test/__mocks__/styleMock.ts` — requerido porque jsdom no puede parsear CSS
- **`createSupabaseServerClient`:** mockear con `vi.mock('@/lib/supabase/server')` en tests de API Routes
- **`AbortSignal.timeout`:** usar `vi.stubGlobal('AbortSignal', ...)` en tests de hooks con fetch

## Flujo de trabajo en el proyecto

Este proyecto usa **BMad** (método de desarrollo con agentes). Los artefactos viven en:

```
_bmad-output/
├── planning-artifacts/       # PRD, arquitectura, epics (referencia)
└── implementation-artifacts/ # Story files + sprint-status.yaml
```

El estado actual de cada story y epic está en `sprint-status.yaml`.

Para entender qué se implementó en cada story, ver `docs/CHANGELOG.md`.

## Tenant de testing

- **Nombre:** ISADI (Instituto San Diego)
- **`tenant_id`:** `5298fcc5-15bf-494c-9655-b49d759cfef4`
- **Proyecto Supabase:** `zgknmifmeoacravtskbx`

## Dónde pedir ayuda

- **Schema de DB:** leer `supabase/migrations/` — nunca conectarse a Supabase remotamente para inferir el schema
- **Decisiones de arquitectura:** `docs/ARCHITECTURE.md`
- **Historial de implementación:** `docs/CHANGELOG.md`
- **Qué implementar a continuación:** `_bmad-output/implementation-artifacts/sprint-status.yaml`
- **Advertencias de Next.js 16:** `AGENTS.md` en la raíz del repo
