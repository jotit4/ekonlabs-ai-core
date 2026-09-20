-- Migration 075: `dashboard_users.preferences` (jsonb) + backfill de
-- `agenda_area_focus_label` en tenants.rules — SOLO ISADI
--
-- Paso 2 de 3 del pedido del dueño sobre el foco de área de la agenda
-- (migración 062: `tenants.rules.agenda_area_focus`). El recorte a
-- rehabilitación de ISADI era invisible y no se podía apagar desde la
-- interfaz: un admin no tenía forma de ver en la agenda los turnos de
-- Odontología, Aquagym, Hidroterapia ni Pilates. El dueño pidió un selector
-- "Ver" al lado de los botones de grupo (AgendaFilters/AgendaServiceButtons)
-- que sea PERSISTENTE, "guardado como config de preferencia para ese usuario
-- logueado" — es decir, por usuario, en la base, no en localStorage ni en la
-- URL. El comportamiento actual (recorte a rehab) sigue siendo el default de
-- ISADI, pero deja de ser la única opción.
--
-- Dos cambios, ambos aditivos y no destructivos:
--
-- 1) `dashboard_users.preferences` (jsonb NOT NULL DEFAULT '{}') — la
--    preferencia se guarda por FILA DE USUARIO (dashboard_users), no por
--    tenant ni en el JWT: dos usuarios de la misma cuenta pueden elegir cada
--    uno "Rehabilitación" o "Todos los servicios" en su propia sesión sin
--    pisarse. Misma forma jsonb libre que `tenants.rules` (bootstrap_core) y
--    `professionals`/`patients` en otras tablas de este proyecto — evita una
--    tabla nueva para una sola clave chica que puede crecer con más
--    preferencias de UI a futuro (no versionadas, no tipadas a nivel DB; la
--    validación/normalización vive en la API — ver
--    `/api/me/preferences/route.ts`).
--
--    Hoy la única clave que guarda es `agenda_view`, con valores 'foco' |
--    'todos':
--      - 'foco'  = respeta el recorte por defecto de la cuenta
--                  (`agenda_area_focus`, migración 062).
--      - 'todos' = sin recorte, cualquiera sea el default de la cuenta.
--    Sin preferencia guardada (clave ausente), el default lo decide la
--    cuenta: 'foco' si tiene `agenda_area_focus`, 'todos' si no. Una cuenta
--    sin `agenda_area_focus` no cambia en nada (nunca hay nada que elegir), y
--    un usuario de ISADI que nunca tocó el selector ve EXACTAMENTE lo mismo
--    que hoy.
--
--    RLS: NO hace falta ninguna policy nueva. `dashboard_users_update_own`
--    (migración 20260605000001_034) ya permite a cualquier usuario
--    autenticado hacer UPDATE de su propia fila (`user_id = auth.uid()`), sin
--    restricción por columna — esa policy se creó justamente para que
--    doctor/receptionist pudieran guardar su propio `full_name` vía
--    PATCH /api/me/profile. La ruta nueva (`/api/me/preferences`) usa el
--    MISMO patrón: el cliente Supabase de la request (no un cliente con
--    service_role — ver `createSupabaseServerClient`), filtrado por
--    `user_id = auth.uid()` a través de esa policy, y valida en la API que
--    el body solo tenga claves conocidas (hoy, únicamente `agenda_view`)
--    antes de mergear — la superficie insegura (pisar `role`/`tenant_id`/
--    `professional_id` desde este endpoint) ya no existe porque la ruta
--    nunca hace `update({ ...body })`, solo `update({ preferences: merged })`.
--
-- 2) Backfill de `tenants.rules.agenda_area_focus_label` — SOLO ISADI. El
--    selector "Ver" necesita un texto para la opción de foco ("Rehabilitación"
--    para ISADI) que no puede ser un nombre fijo en el código: mismo
--    razonamiento que `reception_groups.fisioterapia.label` (migración 069) —
--    la etiqueta es un DATO DE LA CUENTA, no un literal. `/api/tenant/config`
--    + `useTenantConfig` la exponen ya normalizada (string; si la cuenta no
--    la configuró, cae a 'Rehabilitación' — así que esta clave es, en la
--    práctica, solo un ajuste fino disponible para ISADI u otra clínica de
--    rehabilitación que quiera un texto distinto, no un requisito para que el
--    selector funcione).
--
-- Idempotente y no destructivo, mismo patrón que 062/069:
--   - `ADD COLUMN IF NOT EXISTS` en el ALTER TABLE.
--   - `COALESCE(rules, '{}'::jsonb) || jsonb_build_object(...)` en el SET:
--     mergea preservando `agenda_area_focus` (062), `reception_groups`/
--     `reception_default_group` (069) y cualquier otra clave existente — NO
--     reemplaza `rules` entero.
--   - `WHERE NOT (COALESCE(rules, '{}'::jsonb) ? 'agenda_area_focus_label')`
--     evita pisar un valor ya configurado (manual o por una corrida previa) y
--     hace que re-ejecutar la migración no duplique ni sobrescriba nada.
--
-- DB-only. NO se aplica automáticamente.
--
-- ── ORDEN DE DESPLIEGUE: esta migración va SIEMPRE PRIMERO ──────────────────
-- A diferencia de la 069, acá el orden inverso SÍ rompe: `/api/me/preferences`
-- hace `select('preferences')` y `update({preferences})` sobre una columna que
-- no existiría todavía. Si el código saliera antes:
--   - toda cuenta que abra la Agenda dispara un GET fallido (el panel sigue
--     funcionando: sin preferencia, cae al default de la cuenta);
--   - en ISADI el selector «Ver» YA aparece (depende de `agenda_area_focus`,
--     migración 062, no de esta), así que si alguien lo toca, el PATCH
--     devuelve 500, el cambio se revierte y sale un aviso de error.
-- Nada se corrompe ni se pierde, pero es una falla visible. Aplicar primero.

ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.dashboard_users.preferences IS
  'Preferencias de UI del usuario logueado (075), jsonb libre validado en la API (ver /api/me/preferences/route.ts). Hoy solo `agenda_view` (''foco'' | ''todos''): qué ve en la Agenda cuando la cuenta tiene agenda_area_focus configurado (062). Sin la clave, el default lo decide la cuenta. RLS: dashboard_users_update_own (034) ya cubre el UPDATE de la fila propia, sin policy nueva.';

UPDATE public.tenants
SET rules = COALESCE(rules, '{}'::jsonb) || jsonb_build_object(
  'agenda_area_focus_label', 'Rehabilitación'
)
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
  AND NOT (COALESCE(rules, '{}'::jsonb) ? 'agenda_area_focus_label');
