
DO $$
DECLARE
  v_tenant UUID := '5298fcc5-15bf-494c-9655-b49d759cfef4';
BEGIN
  UPDATE public.services SET booking_mode='gated', capacity_per_slot=6, professional_name='Patricia Pérez Bernal / Aldo Luque' WHERE tenant_id=v_tenant AND name ILIKE '%kinesiolog%';
  UPDATE public.services SET booking_mode='gated', capacity_per_slot=6, professional_name='Patricia Pérez Bernal / Aldo Luque' WHERE tenant_id=v_tenant AND name ILIKE '%fisioterapia%';
  UPDATE public.services SET booking_mode='gated', capacity_per_slot=6, professional_name='Patricia Pérez Bernal / Aldo Luque' WHERE tenant_id=v_tenant AND name ILIKE '%rehabilitaci%' AND name NOT ILIKE '%traumatol%';
  UPDATE public.services SET booking_mode='gated', capacity_per_slot=9, professional_name='Profesora Martina' WHERE tenant_id=v_tenant AND name ILIKE '%hidroterapia%';
  UPDATE public.services SET booking_mode='cycle', capacity_per_slot=4, professional_name='Prof. Rocío López' WHERE tenant_id=v_tenant AND name ILIKE '%pilates%';
  UPDATE public.services SET booking_mode='cycle', capacity_per_slot=9, professional_name='Profesora Martina' WHERE tenant_id=v_tenant AND name ILIKE '%aquagym%';
  UPDATE public.services SET booking_mode='walk_in', capacity_per_slot=NULL, professional_name='Dr. Juan Diego Rodríguez' WHERE tenant_id=v_tenant AND name ILIKE '%traumatol%' AND name NOT ILIKE '%villavicencio%';
  UPDATE public.services SET booking_mode='appointment', capacity_per_slot=NULL, professional_name='Dr. Villavicencio' WHERE tenant_id=v_tenant AND name ILIKE '%villavicencio%';
  UPDATE public.services SET booking_mode='appointment', capacity_per_slot=NULL, professional_name='Dr. Juan Pablo Rodríguez' WHERE tenant_id=v_tenant AND name ILIKE '%odontolog%';
END $$;
;
