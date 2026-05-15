-- Migration: seed ISADI — profesionales y horarios iniciales
-- Story 9.1 — Migraciones Calendario Nativo
-- 2026-05-16
--
-- Tenant ISADI: 5298fcc5-15bf-494c-9655-b49d759cfef4
-- Profesionales: Patricia Pérez Bernal, Aldo Luque
-- Servicios: Kinesiología, Fisioterapia, Rehabilitación física
-- Horarios: Lunes-Viernes (0-4 en notación ISO), 08:00-18:00
--
-- Idempotente: ON CONFLICT DO NOTHING + re-query del ID real en caso de conflicto

DO $$
DECLARE
  v_tenant     UUID := '5298fcc5-15bf-494c-9655-b49d759cfef4';
  v_patricia   UUID;
  v_aldo       UUID;
  v_kine_id    UUID;
  v_fisio_id   UUID;
  v_rehab_id   UUID;
BEGIN
  -- ── Insertar Patricia Pérez Bernal ────────────────────────────────────────
  v_patricia := gen_random_uuid();

  INSERT INTO public.professionals (professional_id, tenant_id, name, email, active)
  VALUES (v_patricia, v_tenant, 'Patricia Pérez Bernal', 'patricia@isadi.com.ar', TRUE)
  ON CONFLICT (email) DO NOTHING;

  -- Si ya existía, obtener el ID real (ON CONFLICT no lo sobrescribe)
  SELECT professional_id INTO v_patricia
  FROM public.professionals
  WHERE email = 'patricia@isadi.com.ar';

  -- ── Insertar Aldo Luque ───────────────────────────────────────────────────
  v_aldo := gen_random_uuid();

  INSERT INTO public.professionals (professional_id, tenant_id, name, email, active)
  VALUES (v_aldo, v_tenant, 'Aldo Luque', 'aldo@isadi.com.ar', TRUE)
  ON CONFLICT (email) DO NOTHING;

  SELECT professional_id INTO v_aldo
  FROM public.professionals
  WHERE email = 'aldo@isadi.com.ar';

  -- ── Obtener service_ids de ISADI por nombre exacto ────────────────────────
  SELECT service_id INTO v_kine_id
  FROM public.services
  WHERE tenant_id = v_tenant AND name = 'Kinesiología';

  SELECT service_id INTO v_fisio_id
  FROM public.services
  WHERE tenant_id = v_tenant AND name = 'Fisioterapia';

  SELECT service_id INTO v_rehab_id
  FROM public.services
  WHERE tenant_id = v_tenant AND name = 'Rehabilitación física';

  -- ── Vincular Patricia a los 3 servicios ───────────────────────────────────
  IF v_kine_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id)
    VALUES (v_kine_id, v_patricia)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_fisio_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id)
    VALUES (v_fisio_id, v_patricia)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_rehab_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id)
    VALUES (v_rehab_id, v_patricia)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── Vincular Aldo a los 3 servicios ──────────────────────────────────────
  IF v_kine_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id)
    VALUES (v_kine_id, v_aldo)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_fisio_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id)
    VALUES (v_fisio_id, v_aldo)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_rehab_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id)
    VALUES (v_rehab_id, v_aldo)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── Horarios Lun-Vie 08:00-18:00 para Patricia ───────────────────────────
  -- days 0-4 = Lunes a Viernes (ISO week notation)
  INSERT INTO public.professional_schedules (professional_id, day_of_week, start_time, end_time)
  SELECT v_patricia, d, '08:00'::TIME, '18:00'::TIME
  FROM generate_series(0, 4) AS d
  ON CONFLICT (professional_id, day_of_week, start_time) DO NOTHING;

  -- ── Horarios Lun-Vie 08:00-18:00 para Aldo ───────────────────────────────
  INSERT INTO public.professional_schedules (professional_id, day_of_week, start_time, end_time)
  SELECT v_aldo, d, '08:00'::TIME, '18:00'::TIME
  FROM generate_series(0, 4) AS d
  ON CONFLICT (professional_id, day_of_week, start_time) DO NOTHING;

END $$;
