-- Migration 012: configura booking_mode, capacity_per_slot y professional_name
-- para los servicios del tenant ISADI (5298fcc5-15bf-494c-9655-b49d759cfef4).
--
-- booking_mode:
--   gated      = requiere pedido/consulta médica previa
--   cycle      = inscripción mensual/semanal fija (sin turno individual)
--   walk_in    = sin turno, por orden de llegada
--   appointment = turno individual por calendario
--
-- Esta migración solo actualiza servicios existentes; no inserta nuevos.
-- Los calendar_id ya existen en la tabla (fueron configurados manualmente).

DO $$
DECLARE
  v_tenant UUID := '5298fcc5-15bf-494c-9655-b49d759cfef4';
BEGIN

  -- Kinesiología: gated (pedido médico), 6 pacientes/hora
  UPDATE public.services SET
    booking_mode     = 'gated',
    capacity_per_slot = 6,
    professional_name = 'Patricia Pérez Bernal / Aldo Luque'
  WHERE tenant_id = v_tenant AND name ILIKE '%kinesiolog%';

  -- Fisioterapia: gated (pedido médico), 6 pacientes/hora
  UPDATE public.services SET
    booking_mode     = 'gated',
    capacity_per_slot = 6,
    professional_name = 'Patricia Pérez Bernal / Aldo Luque'
  WHERE tenant_id = v_tenant AND name ILIKE '%fisioterapia%';

  -- Rehabilitación física: gated (pedido médico), 6 pacientes/hora
  UPDATE public.services SET
    booking_mode     = 'gated',
    capacity_per_slot = 6,
    professional_name = 'Patricia Pérez Bernal / Aldo Luque'
  WHERE tenant_id = v_tenant AND name ILIKE '%rehabilitaci%' AND name NOT ILIKE '%traumatol%';

  -- Hidroterapia: gated (pedido médico), 9 alumnos/sesión
  UPDATE public.services SET
    booking_mode     = 'gated',
    capacity_per_slot = 9,
    professional_name = 'Profesora Martina'
  WHERE tenant_id = v_tenant AND name ILIKE '%hidroterapia%';

  -- Pilates: ciclo semanal fijo, 4 alumnos/clase
  UPDATE public.services SET
    booking_mode     = 'cycle',
    capacity_per_slot = 4,
    professional_name = 'Prof. Rocío López'
  WHERE tenant_id = v_tenant AND name ILIKE '%pilates%';

  -- Aquagym: ciclo semanal fijo, 9 alumnos/sesión
  UPDATE public.services SET
    booking_mode     = 'cycle',
    capacity_per_slot = 9,
    professional_name = 'Profesora Martina'
  WHERE tenant_id = v_tenant AND name ILIKE '%aquagym%';

  -- Rehabilitación traumatológica: sin turno, por orden de llegada
  UPDATE public.services SET
    booking_mode     = 'walk_in',
    capacity_per_slot = NULL,
    professional_name = 'Dr. Juan Diego Rodríguez'
  WHERE tenant_id = v_tenant AND name ILIKE '%traumatol%' AND name NOT ILIKE '%villavicencio%';

  -- Traumatología Dr. Villavicencio: turno individual
  UPDATE public.services SET
    booking_mode     = 'appointment',
    capacity_per_slot = NULL,
    professional_name = 'Dr. Villavicencio'
  WHERE tenant_id = v_tenant AND name ILIKE '%villavicencio%';

  -- Odontología: turno individual (solo 3/día — se gestiona desde Calendar)
  UPDATE public.services SET
    booking_mode     = 'appointment',
    capacity_per_slot = NULL,
    professional_name = 'Dr. Juan Pablo Rodríguez'
  WHERE tenant_id = v_tenant AND name ILIKE '%odontolog%';

END $$;
