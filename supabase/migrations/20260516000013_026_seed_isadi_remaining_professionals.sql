-- Migration: seed ISADI — profesionales faltantes
-- 2026-05-15
--
-- Tenant ISADI: 5298fcc5-15bf-494c-9655-b49d759cfef4
-- Agrega los 6 profesionales que figuran en servicios pero no estaban en la tabla professionals:
--   Profesora Martina     → Aquagym, Hidroterapia
--   Prof. Rocío López     → Pilates
--   Dr. Juan Diego Rodríguez → Rehabilitación traumatológica
--   Dr. Villavicencio     → Traumatología (Dr. Villavicencio)
--   Dr. Juan Pablo Rodríguez → Odontología
--   Prof. Carolina López  → Gimnasia Prenatal (servicio inactivo, profesional activa)
--
-- Idempotente: ON CONFLICT DO NOTHING + re-query del ID real en caso de conflicto

DO $$
DECLARE
  v_tenant       UUID := '5298fcc5-15bf-494c-9655-b49d759cfef4';
  v_martina      UUID;
  v_rocio        UUID;
  v_juandiego    UUID;
  v_villavicencio UUID;
  v_juanpablo    UUID;
  v_carolina     UUID;

  v_aquagym_id         UUID;
  v_hidroterapia_id    UUID;
  v_pilates_id         UUID;
  v_rehab_trauma_id    UUID;
  v_traumato_id        UUID;
  v_odonto_id          UUID;
  v_prenatal_id        UUID;
BEGIN

  -- ── Profesora Martina ─────────────────────────────────────────────────────
  v_martina := gen_random_uuid();
  INSERT INTO public.professionals (professional_id, tenant_id, name, email, active)
  VALUES (v_martina, v_tenant, 'Profesora Martina', 'martina@isadi.com.ar', TRUE)
  ON CONFLICT (email) DO NOTHING;
  SELECT professional_id INTO v_martina FROM public.professionals WHERE email = 'martina@isadi.com.ar';

  -- ── Prof. Rocío López ─────────────────────────────────────────────────────
  v_rocio := gen_random_uuid();
  INSERT INTO public.professionals (professional_id, tenant_id, name, email, active)
  VALUES (v_rocio, v_tenant, 'Prof. Rocío López', 'rocio@isadi.com.ar', TRUE)
  ON CONFLICT (email) DO NOTHING;
  SELECT professional_id INTO v_rocio FROM public.professionals WHERE email = 'rocio@isadi.com.ar';

  -- ── Dr. Juan Diego Rodríguez ──────────────────────────────────────────────
  v_juandiego := gen_random_uuid();
  INSERT INTO public.professionals (professional_id, tenant_id, name, email, active)
  VALUES (v_juandiego, v_tenant, 'Dr. Juan Diego Rodríguez', 'juandiego@isadi.com.ar', TRUE)
  ON CONFLICT (email) DO NOTHING;
  SELECT professional_id INTO v_juandiego FROM public.professionals WHERE email = 'juandiego@isadi.com.ar';

  -- ── Dr. Villavicencio ─────────────────────────────────────────────────────
  v_villavicencio := gen_random_uuid();
  INSERT INTO public.professionals (professional_id, tenant_id, name, email, active)
  VALUES (v_villavicencio, v_tenant, 'Dr. Villavicencio', 'villavicencio@isadi.com.ar', TRUE)
  ON CONFLICT (email) DO NOTHING;
  SELECT professional_id INTO v_villavicencio FROM public.professionals WHERE email = 'villavicencio@isadi.com.ar';

  -- ── Dr. Juan Pablo Rodríguez ──────────────────────────────────────────────
  v_juanpablo := gen_random_uuid();
  INSERT INTO public.professionals (professional_id, tenant_id, name, email, active)
  VALUES (v_juanpablo, v_tenant, 'Dr. Juan Pablo Rodríguez', 'juanpablo@isadi.com.ar', TRUE)
  ON CONFLICT (email) DO NOTHING;
  SELECT professional_id INTO v_juanpablo FROM public.professionals WHERE email = 'juanpablo@isadi.com.ar';

  -- ── Prof. Carolina López ──────────────────────────────────────────────────
  v_carolina := gen_random_uuid();
  INSERT INTO public.professionals (professional_id, tenant_id, name, email, active)
  VALUES (v_carolina, v_tenant, 'Prof. Carolina López', 'carolina@isadi.com.ar', TRUE)
  ON CONFLICT (email) DO NOTHING;
  SELECT professional_id INTO v_carolina FROM public.professionals WHERE email = 'carolina@isadi.com.ar';

  -- ── Obtener service_ids ───────────────────────────────────────────────────
  SELECT service_id INTO v_aquagym_id      FROM public.services WHERE tenant_id = v_tenant AND name = 'Aquagym';
  SELECT service_id INTO v_hidroterapia_id FROM public.services WHERE tenant_id = v_tenant AND name = 'Hidroterapia';
  SELECT service_id INTO v_pilates_id      FROM public.services WHERE tenant_id = v_tenant AND name = 'Pilates';
  SELECT service_id INTO v_rehab_trauma_id FROM public.services WHERE tenant_id = v_tenant AND name = 'Rehabilitación traumatológica';
  SELECT service_id INTO v_traumato_id     FROM public.services WHERE tenant_id = v_tenant AND name = 'Traumatología (Dr. Villavicencio)';
  SELECT service_id INTO v_odonto_id       FROM public.services WHERE tenant_id = v_tenant AND name = 'Odontología';
  SELECT service_id INTO v_prenatal_id     FROM public.services WHERE tenant_id = v_tenant AND name = 'Gimnasia Prenatal';

  -- ── Vincular Martina → Aquagym, Hidroterapia ─────────────────────────────
  IF v_aquagym_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id) VALUES (v_aquagym_id, v_martina) ON CONFLICT DO NOTHING;
  END IF;
  IF v_hidroterapia_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id) VALUES (v_hidroterapia_id, v_martina) ON CONFLICT DO NOTHING;
  END IF;

  -- ── Vincular Rocío → Pilates ──────────────────────────────────────────────
  IF v_pilates_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id) VALUES (v_pilates_id, v_rocio) ON CONFLICT DO NOTHING;
  END IF;

  -- ── Vincular Juan Diego → Rehabilitación traumatológica ──────────────────
  IF v_rehab_trauma_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id) VALUES (v_rehab_trauma_id, v_juandiego) ON CONFLICT DO NOTHING;
  END IF;

  -- ── Vincular Villavicencio → Traumatología ────────────────────────────────
  IF v_traumato_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id) VALUES (v_traumato_id, v_villavicencio) ON CONFLICT DO NOTHING;
  END IF;

  -- ── Vincular Juan Pablo → Odontología ────────────────────────────────────
  IF v_odonto_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id) VALUES (v_odonto_id, v_juanpablo) ON CONFLICT DO NOTHING;
  END IF;

  -- ── Vincular Carolina → Gimnasia Prenatal ────────────────────────────────
  IF v_prenatal_id IS NOT NULL THEN
    INSERT INTO public.service_professionals (service_id, professional_id) VALUES (v_prenatal_id, v_carolina) ON CONFLICT DO NOTHING;
  END IF;

  -- ── Horarios Lun-Vie 08:00-18:00 para todos ───────────────────────────────
  INSERT INTO public.professional_schedules (professional_id, day_of_week, start_time, end_time)
  SELECT prof_id, d, '08:00'::TIME, '18:00'::TIME
  FROM unnest(ARRAY[v_martina, v_rocio, v_juandiego, v_villavicencio, v_juanpablo, v_carolina]) AS prof_id
  CROSS JOIN generate_series(0, 4) AS d
  ON CONFLICT (professional_id, day_of_week, start_time) DO NOTHING;

END $$;
