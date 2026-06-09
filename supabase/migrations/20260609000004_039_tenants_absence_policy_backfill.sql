-- Migration 039: backfill `absence_policy` en tenants.rules (Epic 13 — Paquetes de sesiones)
-- Esquema AUTORITATIVO: _bmad-output/planning-artifacts/domain-tratamiento-clinico.md §4.
--
-- La política de ausentismo vive DENTRO de tenants.rules (jsonb NOT NULL DEFAULT '{}',
-- bootstrap_core L40), bajo la clave 'absence_policy'. NO se crea tabla ni columna nueva.
--
-- Default = regla ISADI (§4.2):
--   { "notice_window_hours": 24, "allow_recovery_on_notice": true, "no_show_consequence": "lose" }
--
-- Idempotente y no destructivo:
--   - `||` mergea preservando todas las demás claves de `rules` (NO reemplaza todo el jsonb).
--   - `WHERE NOT (rules ? 'absence_policy')` evita pisar una política ya configurada y
--     hace que re-ejecutar la migración no duplique ni sobrescriba nada.
--
-- DB-only. NO se aplica automáticamente: el usuario la aplica en EasyPanel.

UPDATE public.tenants
SET rules = rules || jsonb_build_object(
  'absence_policy', jsonb_build_object(
    'notice_window_hours', 24,
    'allow_recovery_on_notice', true,
    'no_show_consequence', 'lose'
  )
)
WHERE NOT (rules ? 'absence_policy');
