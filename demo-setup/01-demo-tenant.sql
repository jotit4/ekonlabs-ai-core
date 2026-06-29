-- =============================================================================
-- TENANT DEMO — Datos 100% ficticios para demostración del sistema
-- =============================================================================
-- Ejecutar en Supabase Studio > SQL Editor (rol postgres / service_role).
-- Idempotente: se puede re-ejecutar sin duplicar datos.
--
-- IMPORTANTE:
--   - shadow_mode_enabled = TRUE → el agente IA NO responde a pacientes reales.
--   - Todos los datos son ficticios (nombre, email, teléfono). No usar datos reales.
--   - El tenant_id es fijo ('00000000-0000-4000-a000-000000000001') para que
--     el README pueda referenciar el UUID sin buscar en la DB.
--   - El usuario admin del dashboard se crea APARTE (ver README.md, paso 2).
--
-- Tenant demo UUID (fijo, reservado para demo):
--   00000000-0000-4000-a000-000000000001
-- =============================================================================

DO $$
DECLARE
  -- UUID fijo para el tenant demo — NO cambiar
  v_demo_uuid  UUID := '00000000-0000-4000-a000-000000000001'::uuid;

  -- ── variables internas ──
  v_tenant     UUID;
  v_prof1      UUID;
  v_prof2      UUID;
  v_prof3      UUID;
  v_svc1       UUID;
  v_svc2       UUID;
  v_cal1       TEXT;
  v_cal2       TEXT;
BEGIN
  -- ── 1) TENANT ──────────────────────────────────────────────────────────────
  -- Número de WhatsApp ficticio único para el demo (+54 0 000 0000-0002)
  INSERT INTO public.tenants (
    tenant_id,
    name,
    whatsapp_number,
    timezone,
    shadow_mode_enabled,   -- TRUE = agente NO activo, no dispara sobre nadie real
    status,
    uses_native_calendar,
    rules
  )
  VALUES (
    v_demo_uuid,
    'Clínica Demo',
    '+540000000002',       -- ficticio — no es un número real
    'America/Argentina/Buenos_Aires',
    TRUE,
    'active',
    TRUE,
    '{}'::jsonb
  )
  ON CONFLICT (tenant_id) DO UPDATE
    SET name                = EXCLUDED.name,
        shadow_mode_enabled = EXCLUDED.shadow_mode_enabled
  RETURNING tenant_id INTO v_tenant;

  RAISE NOTICE 'Tenant demo: % (id=%)', 'Clinica Demo', v_tenant;

  -- ── 2) CONFIG DEL AGENTE IA (v2_clinic_configs) ────────────────────────────
  INSERT INTO public.v2_clinic_configs (
    org_id,
    clinic_name,
    agent_name,
    ia_config,
    operations_config,
    prompt_rules,
    chatwoot_config,
    alert_rules
  )
  VALUES (
    v_tenant,
    'Clínica Demo',
    'Asistente Demo',
    jsonb_build_object(
      'tone', 'profesional y amable',
      'features', jsonb_build_object(
        'enable_new_appointment', TRUE,
        'enable_cancel_appointment', TRUE,
        'require_dni', FALSE
      ),
      'constraints', '{}'::jsonb
    ),
    jsonb_build_object('min_notice_hours', 2, 'future_window_days', 30),
    'Este es un entorno de DEMO. No responder a pacientes reales.',
    '{}'::jsonb,
    '[]'::jsonb
  )
  ON CONFLICT (org_id) DO UPDATE
    SET clinic_name = EXCLUDED.clinic_name,
        agent_name  = EXCLUDED.agent_name,
        prompt_rules = EXCLUDED.prompt_rules;

  -- ── 3) PROFESIONALES FICTICIOS ─────────────────────────────────────────────
  -- Nombres claramente ficticios para evitar confusión con personas reales

  INSERT INTO public.professionals (tenant_id, name, email, active)
  VALUES (v_tenant, 'Dra. Ana Demo García', 'ana.demo@clinicademo.ar', TRUE)
  ON CONFLICT (email) DO NOTHING;
  SELECT professional_id INTO v_prof1
  FROM public.professionals WHERE email = 'ana.demo@clinicademo.ar';

  INSERT INTO public.professionals (tenant_id, name, email, active)
  VALUES (v_tenant, 'Dr. Carlos Ejemplo López', 'carlos.demo@clinicademo.ar', TRUE)
  ON CONFLICT (email) DO NOTHING;
  SELECT professional_id INTO v_prof2
  FROM public.professionals WHERE email = 'carlos.demo@clinicademo.ar';

  INSERT INTO public.professionals (tenant_id, name, email, active)
  VALUES (v_tenant, 'Lic. Marta Test Rodríguez', 'marta.demo@clinicademo.ar', TRUE)
  ON CONFLICT (email) DO NOTHING;
  SELECT professional_id INTO v_prof3
  FROM public.professionals WHERE email = 'marta.demo@clinicademo.ar';

  RAISE NOTICE 'Profesionales creados: %, %, %', v_prof1, v_prof2, v_prof3;

  -- ── 4) SERVICIOS ───────────────────────────────────────────────────────────
  -- Nota: services.calendar_id es legacy (calendario nativo no lo usa).
  -- Se llena con un valor sintético requerido por el NOT NULL.

  v_cal1 := 'native_' || v_tenant::text || '_consulta_general';
  SELECT service_id INTO v_svc1
  FROM public.services WHERE tenant_id = v_tenant AND name = 'Consulta General Demo';

  IF v_svc1 IS NULL THEN
    INSERT INTO public.services (
      tenant_id, name, calendar_id, duration_minutes, booking_mode, active, require_referral
    )
    VALUES (
      v_tenant, 'Consulta General Demo', v_cal1, 30,
      'appointment', TRUE, FALSE
    )
    RETURNING service_id INTO v_svc1;
  END IF;

  v_cal2 := 'native_' || v_tenant::text || '_psicologia_demo';
  SELECT service_id INTO v_svc2
  FROM public.services WHERE tenant_id = v_tenant AND name = 'Sesión de Psicología Demo';

  IF v_svc2 IS NULL THEN
    INSERT INTO public.services (
      tenant_id, name, calendar_id, duration_minutes, booking_mode, active, require_referral
    )
    VALUES (
      v_tenant, 'Sesión de Psicología Demo', v_cal2, 50,
      'appointment', TRUE, FALSE
    )
    RETURNING service_id INTO v_svc2;
  END IF;

  RAISE NOTICE 'Servicios: % (%), % (%)', 'Consulta General Demo', v_svc1, 'Sesión de Psicología Demo', v_svc2;

  -- ── 5) VÍNCULOS SERVICIO ↔ PROFESIONAL ─────────────────────────────────────
  INSERT INTO public.service_professionals (service_id, professional_id)
  VALUES
    (v_svc1, v_prof1), (v_svc1, v_prof2),
    (v_svc2, v_prof3)
  ON CONFLICT DO NOTHING;

  -- ── 6) HORARIOS DE ATENCIÓN (service_hours) ────────────────────────────────
  -- Lunes a Viernes, 09:00-18:00, slot de 30 min — para "Consulta General Demo"
  -- (day_of_week convención Postgres DOW: 0=dom, 1=lun, …, 5=vie, 6=sáb)
  INSERT INTO public.service_hours (
    service_id, tenant_id, day_of_week, start_time, end_time, slot_duration_minutes, active
  )
  SELECT v_svc1, v_tenant, d, TIME '09:00', TIME '18:00', 30, TRUE
  FROM generate_series(1, 5) AS d
  ON CONFLICT DO NOTHING;

  -- Lunes, Miércoles, Viernes, 10:00-17:00, slot de 50 min — para "Sesión de Psicología Demo"
  INSERT INTO public.service_hours (
    service_id, tenant_id, day_of_week, start_time, end_time, slot_duration_minutes, active
  )
  SELECT v_svc2, v_tenant, d, TIME '10:00', TIME '17:00', 50, TRUE
  FROM (VALUES (1), (3), (5)) AS t(d)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Setup demo completo. tenant_id=%', v_tenant;
  RAISE NOTICE 'IMPORTANTE: shadow_mode_enabled=TRUE — el agente IA está en modo silencioso.';
  RAISE NOTICE 'IMPORTANTE: Crear usuario demo@clinicademo.ar en Supabase Auth manualmente (ver README.md).';
END $$;

-- =============================================================================
-- VERIFICACIÓN (correr aparte luego de ejecutar)
-- =============================================================================
-- SELECT t.tenant_id, t.name, t.shadow_mode_enabled,
--        (SELECT count(*) FROM services      s WHERE s.tenant_id=t.tenant_id) AS servicios,
--        (SELECT count(*) FROM professionals p WHERE p.tenant_id=t.tenant_id) AS profesionales,
--        (SELECT count(*) FROM service_hours h WHERE h.tenant_id=t.tenant_id) AS horarios
-- FROM tenants t WHERE t.tenant_id = '00000000-0000-4000-a000-000000000001';
