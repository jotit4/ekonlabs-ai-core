-- ============================================================================
-- Migration 053 — services.reception_group (agrupador para la vista de recepción)
-- ============================================================================
-- 2026-07-16 — 3 pedidos ISADI para simplificar la vista de RECEPCIÓN (reunión
-- 2026-07-14): "Dar un turno" sin elegir servicio/profesional para
-- Fisioterapia, 3 botones de grupo (Fisioterapia/Pileta/Pilates) en el
-- calendario, y selector de vista Día/Semana/Mes siempre visible.
--
-- YA APLICADA EN PROD — este archivo es solo para versionar el cambio. NO
-- volver a ejecutar la migración manualmente.
-- ============================================================================

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS reception_group text;
COMMENT ON COLUMN public.services.reception_group IS 'Agrupador para la vista de recepción (ej. fisioterapia/pileta/pilates). NULL = no visible en recepción. Los otros roles ven el servicio real, no el grupo.';
UPDATE public.services SET reception_group='fisioterapia' WHERE tenant_id='5298fcc5-15bf-494c-9655-b49d759cfef4' AND name IN ('Fisioterapia','Kinesiología','Rehabilitación física','Rehabilitación traumatológica','Traumatología (Dr. Villavicencio)');
UPDATE public.services SET reception_group='pileta' WHERE tenant_id='5298fcc5-15bf-494c-9655-b49d759cfef4' AND name IN ('Aquagym','Hidroterapia');
UPDATE public.services SET reception_group='pilates' WHERE tenant_id='5298fcc5-15bf-494c-9655-b49d759cfef4' AND name='Pilates';
