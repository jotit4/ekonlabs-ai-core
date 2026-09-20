-- Migration 069: backfill `reception_groups` / `reception_default_group` en
-- tenants.rules — SOLO ISADI
--
-- Bug: `NewTurnoModal.tsx` tenía el grupo de recepción fijo en el código
-- (`RECEPTION_FISIO_GROUP = 'fisioterapia'`) y el rótulo "Fisioterapia"
-- escrito a mano, igual que `AgendaFilters.tsx` (array `RECEPTION_GROUPS`
-- fijo con fisioterapia/pileta/pilates). En cualquier cuenta que no
-- etiquetara sus servicios con esos mismos tres `reception_group` (migración
-- 053) — por ejemplo la cuenta demo, sin ningún servicio agrupado — el rol
-- recepción veía en "Dar un turno" el servicio fijo "Fisioterapia"
-- (inexistente en esa cuenta) y el horario quedaba deshabilitado, sin ningún
-- aviso.
--
-- Fix: "Fisioterapia" deja de ser un nombre fijo en el código y pasa a ser un
-- DATO DE LA CUENTA dentro de `tenants.rules` (jsonb NOT NULL DEFAULT '{}',
-- bootstrap_core L40) — mismo lugar ya establecido para configuración por
-- cuenta (precedente: `absence_policy` migración 039, `agenda_area_focus`
-- migración 062). Dos claves nuevas:
--   - `reception_groups`: objeto cuyas claves son los valores de
--     `services.reception_group` (migración 053) y cuyos valores son
--     `{ "label": string, "order": number, "main_service_id": uuid | null }`
--     — la etiqueta visible del grupo, la posición de su botón en la agenda
--     (jsonb no conserva el orden de las claves: en ISADI 1/2/3 =
--     Fisioterapia/Pileta/Pilates, el orden que tenía el array fijo) y el
--     servicio principal que usan las series de sesiones (bono x5/x10) del
--     flujo simplificado de recepción.
--   - `reception_default_group`: la clave del grupo con el que trabaja el
--     formulario simplificado de "Dar un turno" para el rol recepción. En
--     ISADI, `'fisioterapia'`.
-- `/api/tenant/config` + `useTenantConfig` exponen ambas claves ya validadas
-- y normalizadas. `NewTurnoModal`/`AgendaFilters` las leen en vez de tener el
-- grupo/rótulo fijos — una cuenta sin este ajuste (o sin servicios activos en
-- el grupo por defecto) ya no fuerza el flujo simplificado: recepción ve el
-- mismo formulario completo que administración.
--
-- Este backfill aplica ÚNICAMENTE a ISADI (el cliente para el que se diseñó
-- el flujo simplificado originalmente) — NO a todos los tenants, a diferencia
-- de 039. El tenant_id de ISADI ya está hardcodeado en migraciones previas
-- (ver 012, 057, 058, 059, 061, 062).
--
-- `main_service_id` de 'fisioterapia' se resuelve con un SELECT dentro de
-- esta misma migración (el `service_id` del servicio activo de ISADI llamado
-- exactamente "Fisioterapia") — sin ningún UUID de servicio escrito a mano.
-- 'pileta'/'pilates' quedan con `main_service_id: null`: hoy solo
-- 'fisioterapia' es el grupo por defecto de recepción (el único que usa el
-- turno único/serie simplificados), así que no hace falta resolverles un
-- servicio principal.
--
-- ── ORDEN DE DESPLIEGUE ──────────────────────────────────────────────────────
-- APLICAR esta migración ANTES de publicar el código que la lee
-- (`/api/tenant/config` devolviendo `reception_groups`/
-- `reception_default_group`, `NewTurnoModal.tsx`, `AgendaFilters.tsx`). El
-- orden inverso NO rompe nada ni pierde datos, pero ISADI dejaría de verse
-- igual hasta aplicarla:
--   - «Dar un turno»: sin `reception_default_group`, recepción vería el
--     formulario completo (el de administración) en vez del simplificado.
--   - Botones de grupo de la agenda (todos los roles): sin `order`, saldrían
--     en orden de aparición — Pileta, Fisioterapia, Pilates — y no
--     Fisioterapia, Pileta, Pilates.
-- Las dos cosas se corrigen solas al aplicar la migración, sin nuevo deploy.
-- Si `main_service_id` quedara sin resolver, el respaldo por nombre de
-- `resolveGroupMainService` (src/lib/agenda/reception-groups.ts) igual
-- encuentra el servicio "Fisioterapia".
--
-- Idempotente y no destructivo:
--   - `COALESCE(rules, '{}'::jsonb)` en el SET y el WHERE: `rules` es
--     NOT NULL DEFAULT '{}' en el schema, pero si alguna fila llegara a tener
--     NULL igual (dato corrupto/manual), esto evita que el `||`/`?` se
--     conviertan en un no-op silencioso.
--   - `||` mergea preservando todas las demás claves de `rules` (NO reemplaza
--     todo el jsonb) — no pisa `agenda_area_focus` (migración 062) ni
--     ninguna otra clave existente de ISADI.
--   - `WHERE NOT (COALESCE(rules, '{}'::jsonb) ? 'reception_groups')` evita
--     pisar un valor ya configurado (manual o por una corrida previa) y hace
--     que re-ejecutar la migración no duplique ni sobrescriba nada.
--
-- DB-only. NO se aplica automáticamente: se aplica a mano sobre la base de
-- producción (ver ORDEN DE DESPLIEGUE arriba).

UPDATE public.tenants
SET rules = COALESCE(rules, '{}'::jsonb) || jsonb_build_object(
  'reception_groups', jsonb_build_object(
    'fisioterapia', jsonb_build_object(
      'label', 'Fisioterapia',
      'order', 1,
      'main_service_id', (
        SELECT service_id
          FROM public.services
         WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
           AND name = 'Fisioterapia'
           AND active = true
         ORDER BY service_id
         LIMIT 1
      )
    ),
    'pileta', jsonb_build_object('label', 'Pileta', 'order', 2, 'main_service_id', NULL),
    'pilates', jsonb_build_object('label', 'Pilates', 'order', 3, 'main_service_id', NULL)
  ),
  'reception_default_group', 'fisioterapia'
)
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
  AND NOT (COALESCE(rules, '{}'::jsonb) ? 'reception_groups');
