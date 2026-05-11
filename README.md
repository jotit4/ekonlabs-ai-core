# ekonlabs Dashboard

Dashboard operativo para el sistema de agente IA de clínicas. Permite al personal (recepcionistas, médicos, administradores) observar y controlar el agente de WhatsApp, gestionar la agenda en tiempo real con Google Calendar, y supervisar cada conversación con los pacientes.

> **Contexto brownfield:** el backend Python/FastAPI + LangGraph + Supabase ya existe. Este dashboard es consumidor puro — no implementa lógica de backend.

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16.2.4 (App Router) |
| UI | React 19.2.4 + Tailwind CSS v4 + shadcn/ui |
| Auth | Supabase Auth + JWT con custom claims (tenant_id, role) |
| DB/Realtime | Supabase (PostgreSQL + Supabase Realtime) |
| Data fetching | Refine v5 + TanStack Query |
| Formularios | react-hook-form + zod + `standardSchemaResolver` |
| Agenda | react-big-calendar (Day view + drag-and-drop) |
| Backend proxy | FastAPIClient (server-side via API Routes) |
| Tests | Vitest 4.1.5 + Testing Library |
| Deploy | Docker + EasyPanel (Node 20 Alpine, standalone output) |

## Requisitos

- Node 20+
- pnpm 9+
- Acceso al proyecto Supabase `zgknmifmeoacravtskbx`

## Setup local

```bash
# 1. Clonar y ubicarse en el repo
git clone https://github.com/jotit4/ekonlabs-ai-core.git
cd ekonlabs-ai-core
git checkout ekonlabs-dashboard

# 2. Instalar dependencias
pnpm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Completar los valores (ver sección Variables de entorno)

# 4. Levantar servidor de desarrollo
pnpm dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Variables de entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key de Supabase | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only — invitación de usuarios) | Sí |
| `FASTAPI_BASE_URL` | URL base del backend FastAPI | Sí (stub si no disponible) |
| `FASTAPI_API_KEY` | API key para autenticar contra FastAPI | Sí (stub si no disponible) |
| `CHATWOOT_ACCESS_TOKEN` | Token de acceso de Chatwoot (Epic 4) | No en Epic 1-2 |

> **Nota:** `FASTAPI_BASE_URL` y `FASTAPI_API_KEY` son server-only. Las API Routes los usan via `FastAPIClient` — nunca llegan al browser.

## Comandos

```bash
pnpm dev          # Servidor de desarrollo
pnpm build        # Build de producción (output: standalone)
pnpm start        # Servidor de producción (post-build)
pnpm lint         # ESLint
pnpm test         # Tests (Vitest)
pnpm test:watch   # Tests en modo watch
```

## Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/            # Login, callback de auth
│   ├── (dashboard)/       # Rutas protegidas por middleware
│   │   ├── agenda/        # Vista de agenda del día
│   │   └── usuarios/      # Gestión de usuarios del tenant
│   └── api/               # API Routes (server-side proxies)
│       ├── appointments/  # POST crear, PATCH reprogramar, POST sync, POST soft-sync
│       ├── gcal/          # GET channel-status
│       ├── health/        # Health check para Docker/EasyPanel
│       ├── patients/      # GET search por DNI
│       └── usuarios/      # POST invite, PATCH toggle active
├── components/
│   ├── agenda/            # CalendarView, TurnoCard, KPIStrip, banners
│   ├── auth/              # Formularios de login
│   ├── shared/            # StatusDot, componentes reutilizables
│   └── usuarios/          # Tabla y formularios de usuarios
├── hooks/                 # Hooks cliente ('use client')
│   ├── use-appointments.ts
│   ├── use-agenda-realtime.ts
│   ├── use-gcal-channel-status.ts
│   ├── use-soft-sync.ts
│   └── ...
├── lib/
│   ├── fastapi/           # FastAPIClient (server-only)
│   ├── supabase/          # client.ts (browser) + server.ts (server)
│   └── utils/             # jwt.ts (parseJwtPayload), otros
├── test/
│   ├── setup.ts           # Vitest setup global
│   └── __mocks__/         # CSS mock para react-big-calendar
└── types/
    └── appointments.ts    # Tipos TypeScript del dominio
supabase/
└── migrations/            # Migraciones SQL (fuente de verdad del schema)
```

## Deploy

Build Docker multi-stage (deps → builder → runner):

```bash
# Build local
docker build -t ekonlabs-dashboard .

# Run local
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=... \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  ekonlabs-dashboard
```

En producción, EasyPanel gestiona las variables de entorno y el health check en `/api/health`.

## Documentación adicional

- [Arquitectura técnica](docs/ARCHITECTURE.md) — patrones, decisiones de diseño, convenciones
- [Onboarding para devs](docs/ONBOARDING.md) — setup completo y guía de trabajo
- [Changelog de implementación](docs/CHANGELOG.md) — historial por epic/story
- [Artefactos de planificación](../_bmad-output/planning-artifacts/) — PRD, arquitectura, epics
- [Sprint status](../_bmad-output/implementation-artifacts/sprint-status.yaml) — estado actual de stories
