# Setup del Tenant Demo — ekonlabs Dashboard

Guía para provisionar un tenant demo con datos 100% ficticios en la misma instancia de Supabase que ISADI. El agente IA queda en `shadow_mode_enabled = TRUE` — no dispara sobre ningún paciente real.

---

## Prerequisitos (antes de empezar)

Aplicar en producción si no están aplicadas:

1. **Parche de seguridad** (`profesionales/route.ts`): la query service_role a `dashboard_users` ya incluye `.eq('tenant_id', tenantId)` — commiteado en el working tree, deployar en EasyPanel para que entre en vigor.
2. **Confirmar `shadow_mode_enabled = TRUE`** en el tenant demo (el script `01-demo-tenant.sql` ya lo hace).
3. **Auditar rutas service_role** (ver sección al final) — hay una ruta de riesgo medio pendiente.

---

## Paso 1 — Ejecutar el script SQL

En **Supabase Studio > SQL Editor** (con rol `postgres` o `service_role`):

1. Abrir `demo-setup/01-demo-tenant.sql` del repo.
2. Copiar y pegar el contenido completo en el editor.
3. Ejecutar. Debe devolver `NOTICE` messages como:
   ```
   Tenant demo: Clinica Demo (id=00000000-0000-4000-a000-000000000001)
   Profesionales creados: <uuid1>, <uuid2>, <uuid3>
   Setup demo completo. tenant_id=00000000-0000-4000-a000-000000000001
   ```
4. Verificar con la query de verificación al pie del script.

**El tenant demo UUID es fijo:**
```
00000000-0000-4000-a000-000000000001
```

---

## Paso 2 — Crear el usuario demo en Supabase Auth

El usuario admin del dashboard NO puede crearse con SQL puro — requiere la Auth API.

En **Supabase Studio > Authentication > Users > Add user**:

| Campo | Valor |
|-------|-------|
| Email | `demo@clinicademo.ar` |
| Password | `DemoClinica2026!` |
| Auto-confirm | Activar (toggle "Auto Confirm User") |

Luego **copiar el `user_id` (UUID)** que aparece en la columna User UID de la lista de usuarios.

---

## Paso 3 — Vincular el usuario al tenant demo

En **Supabase Studio > SQL Editor**, ejecutar el siguiente INSERT (reemplazar `<USER_ID_COPIADO>` con el UUID del paso anterior):

```sql
INSERT INTO public.dashboard_users (
  user_id,
  tenant_id,
  role,
  full_name,
  email,
  professional_id,  -- NULL: es el admin general de la clínica demo, no un profesional
  is_active
)
VALUES (
  '<USER_ID_COPIADO>'::uuid,
  '00000000-0000-4000-a000-000000000001'::uuid,
  'admin',
  'Admin Demo',
  'demo@clinicademo.ar',
  NULL,
  TRUE
)
ON CONFLICT (user_id) DO NOTHING;
```

El hook `custom_access_token_hook` inyectará `tenant_id` y `app_role = 'admin'` automáticamente en el JWT al próximo login.

---

## Paso 4 — Verificar el login

1. Ir a la pantalla de login del dashboard.
2. Usar el botón **"Completar credenciales demo"** (ya implementado en `LoginForm.tsx`) — autocompleta email y contraseña.
   - O ingresar manualmente: `demo@clinicademo.ar` / `DemoClinica2026!`
3. Confirmar que:
   - El login redirige a `/` y luego a `/inicio` (rol admin).
   - La sidebar muestra "Clínica Demo" como nombre del tenant.
   - Los profesionales listados son `Ana Demo García`, `Carlos Ejemplo López`, `Marta Test Rodríguez`.
   - El módulo Agente muestra `shadow_mode_enabled: true` en la config.

---

## Limpieza (para eliminar el tenant demo en el futuro)

```sql
-- ELIMINA todo el tenant demo en cascada (irreversible)
DELETE FROM public.tenants
WHERE tenant_id = '00000000-0000-4000-a000-000000000001';

-- Eliminar el usuario de auth (reemplazar <USER_ID>)
-- Hacer esto desde Supabase Studio > Authentication > Users > Delete
-- o via Admin API:
-- SELECT supabase_admin.delete_user('<USER_ID>');
```

---

## Auditoría de rutas service_role — hallazgos pendientes

Rutas que usan `createServiceRoleClient()` y su estado de seguridad:

| Ruta | Operación | Estado |
|------|-----------|--------|
| `GET /api/profesionales` | `SELECT dashboard_users` | **CORREGIDO** — `.eq('tenant_id', tenantId)` agregado en Tarea 1 |
| `POST /api/profesionales/[id]/usuario` | `SELECT dashboard_users` por `professional_id` | **Riesgo medio** — el professional_id es validado contra el tenant via RLS en el paso previo, pero la query admin no incluye filtro de tenant explícito. Recomendación: agregar `.eq('tenant_id', tenantId)` en la línea 68 de `profesionales/[id]/usuario/route.ts` como defensa en profundidad. |
| `POST /api/usuarios` | `inviteUserByEmail` + `INSERT dashboard_users` | **Seguro** — INSERT siempre incluye `tenant_id: tenantId` del JWT. No hay SELECT sin filtro. |

---

## Notas técnicas

- El tenant demo tiene `shadow_mode_enabled = TRUE` — el agente IA no enviará mensajes a WhatsApp de ningún paciente real aunque tenga configuración de webhook.
- El `whatsapp_number` del tenant demo es `+540000000002` (ficticio, no real). No asignar este número a ningún canal de WhatsApp real.
- El script `01-demo-tenant.sql` es idempotente — se puede re-ejecutar sin duplicar datos.
- El `custom_access_token_hook` inyecta los claims `tenant_id` y `app_role` en el JWT — sin el INSERT en `dashboard_users` (Paso 3), el login exitoso no tendrá claims y todas las APIs devolverán 403.
