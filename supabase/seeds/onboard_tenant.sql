-- =============================================================================
-- ALTA DE TENANT — Script parametrizado e idempotente
-- =============================================================================
-- Plantilla reusable para dar de alta una clínica/profesional nueva en ekonlabs.
-- Espeja el patrón del seed ISADI (migración 020) pero sin hardcodear nada:
-- toda la configuración del tenant vive en el bloque PARÁMETROS de abajo.
--
-- Qué crea (todo idempotente — se puede correr varias veces sin duplicar):
--   1. tenants               — la organización + slug para resolver el webhook
--   2. v2_clinic_configs     — config que consume el AGENTE IA (nombre, tono, features)
--   3. professionals         — el/los profesional/es (email UNIQUE)
--   4. services              — servicio(s) ofrecidos
--   5. service_professionals — vínculo servicio ↔ profesional
--   6. service_hours         — horarios de atención (OPCIONAL — ver nota)
--
-- Qué NO crea (se hace aparte, ver "PASO 2" al final):
--   - El usuario admin del dashboard (auth.users + dashboard_users): requiere
--     crear el usuario en Supabase Auth primero. Instrucciones al pie.
--
-- IMPORTANTE sobre day_of_week (verificado contra check_clinic_availability):
--   Convención Postgres DOW → 0=domingo, 1=lunes, 2=martes, 3=miércoles,
--   4=jueves, 5=viernes, 6=sábado.  (NO es ISO.)
--
-- NOTA: la tabla `services` NO tiene columna de precio. El precio de la sesión
--   no se almacena hoy en el schema — definirlo es una decisión de producto aparte.
-- =============================================================================

DO $$
DECLARE
  -- ┌─────────────────────────────────────────────────────────────────────────┐
  -- │ PARÁMETROS — editar SOLO esta sección para cada tenant nuevo            │
  -- └─────────────────────────────────────────────────────────────────────────┘

  -- Identidad del tenant
  p_name            TEXT := 'Alejandra Calivar';          -- nombre visible
  p_slug            TEXT := 'alejandra-calivar';          -- usado en /webhook/{slug} — único, sin espacios
  p_whatsapp        TEXT := '+540000000000';              -- ⚠️ PENDIENTE: número real (NOT NULL en DB)
  p_timezone        TEXT := 'America/Argentina/Buenos_Aires';
  p_shadow_mode     BOOLEAN := TRUE;                      -- TRUE = DEMO (agente no responde a pacientes reales)

  -- Config del agente IA
  p_agent_name      TEXT := 'Asistente de Alejandra';
  p_tone            TEXT := 'profesional, cálido y empático';

  -- Profesional (en "clínica de 1" es la misma persona que el tenant)
  p_prof_name       TEXT := 'Alejandra Calivar';
  p_prof_email      TEXT := 'alejandra.calivar@demo.ekonlabs.com'; -- DEMO: email no real, solo login dashboard

  -- Servicio
  p_service_name    TEXT := 'Sesión de terapia';
  p_service_minutes INT  := 60;                           -- 1 hora

  -- ── variables internas (no tocar) ──
  v_tenant     UUID;
  v_prof       UUID;
  v_service    UUID;
  v_calendar   TEXT;
BEGIN
  -- ── 1) TENANT ──────────────────────────────────────────────────────────────
  INSERT INTO public.tenants (name, slug, whatsapp_number, timezone,
                              shadow_mode_enabled, status, uses_native_calendar, rules)
  VALUES (p_name, p_slug, p_whatsapp, p_timezone,
          p_shadow_mode, 'active', TRUE, '{}'::jsonb)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name  -- re-corrida: no duplica
  RETURNING tenant_id INTO v_tenant;

  -- ── 2) CONFIG DEL AGENTE (v2_clinic_configs) ───────────────────────────────
  INSERT INTO public.v2_clinic_configs (org_id, clinic_name, agent_name, ia_config,
                                        operations_config, prompt_rules, chatwoot_config, alert_rules)
  VALUES (
    v_tenant,
    p_name,
    p_agent_name,
    jsonb_build_object(
      'tone', p_tone,
      'features', jsonb_build_object(
        'enable_new_appointment', TRUE,
        'enable_cancel_appointment', TRUE,
        'require_dni', FALSE          -- psicología: normalmente no pide DNI para agendar
      ),
      'constraints', '{}'::jsonb
    ),
    jsonb_build_object('min_notice_hours', 2, 'future_window_days', 30),
    '',
    '{}'::jsonb,                       -- ⚠️ PENDIENTE: chatwoot_config (base_url, account_id, inbox_id, access_token)
    '[]'::jsonb
  )
  ON CONFLICT (org_id) DO UPDATE SET clinic_name = EXCLUDED.clinic_name,
                                     agent_name  = EXCLUDED.agent_name;

  -- ── 3) PROFESIONAL ─────────────────────────────────────────────────────────
  INSERT INTO public.professionals (tenant_id, name, email, active)
  VALUES (v_tenant, p_prof_name, p_prof_email, TRUE)
  ON CONFLICT (email) DO NOTHING;
  SELECT professional_id INTO v_prof
  FROM public.professionals WHERE email = p_prof_email;

  -- ── 4) SERVICIO ────────────────────────────────────────────────────────────
  -- CALENDARIO NATIVO: el sistema NO usa Google Calendar. La disponibilidad se
  -- calcula desde service_hours (ver check_clinic_availability). La columna
  -- services.calendar_id es legacy y solo existe por el NOT NULL — se llena con
  -- un valor sintético inocuo (el calendario nativo lo ignora).
  v_calendar := 'native_' || v_tenant::text || '_sesion_terapia';

  SELECT service_id INTO v_service
  FROM public.services WHERE tenant_id = v_tenant AND name = p_service_name;

  IF v_service IS NULL THEN
    INSERT INTO public.services (tenant_id, name, calendar_id, duration_minutes,
                                 booking_mode, active, require_referral)
    VALUES (v_tenant, p_service_name, v_calendar, p_service_minutes,
            'appointment', TRUE, FALSE)   -- psicología: sin derivación obligatoria
    RETURNING service_id INTO v_service;
  END IF;

  -- ── 5) VÍNCULO SERVICIO ↔ PROFESIONAL ──────────────────────────────────────
  INSERT INTO public.service_professionals (service_id, professional_id)
  VALUES (v_service, v_prof)
  ON CONFLICT DO NOTHING;

  -- ── 6) HORARIOS DE ATENCIÓN (service_hours) ────────────────────────────────
  -- ⚠️ PENDIENTE (horarios a definir). Descomentar y ajustar cuando estén.
  -- Ejemplo: Lunes a Viernes de 09:00 a 18:00, slots de 60 min.
  -- (day_of_week: 1=lunes … 5=viernes — convención Postgres DOW)
  --
  -- INSERT INTO public.service_hours (service_id, tenant_id, day_of_week,
  --                                   start_time, end_time, slot_duration_minutes, active)
  -- SELECT v_service, v_tenant, d, TIME '09:00', TIME '18:00', p_service_minutes, TRUE
  -- FROM generate_series(1,5) AS d
  -- ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Tenant creado/actualizado: % (slug=%, tenant_id=%)', p_name, p_slug, v_tenant;
  RAISE NOTICE 'Profesional: % (%)  |  Servicio: % (id=%)', p_prof_name, v_prof, p_service_name, v_service;
END $$;

-- =============================================================================
-- VERIFICACIÓN (correr aparte tras ejecutar)
-- =============================================================================
-- SELECT t.tenant_id, t.name, t.slug, t.shadow_mode_enabled,
--        (SELECT count(*) FROM services s WHERE s.tenant_id=t.tenant_id)      AS servicios,
--        (SELECT count(*) FROM professionals p WHERE p.tenant_id=t.tenant_id) AS profesionales,
--        (SELECT count(*) FROM service_hours h WHERE h.tenant_id=t.tenant_id) AS horarios
-- FROM tenants t WHERE t.slug = 'alejandra-calivar';

-- =============================================================================
-- PASO 2 — Crear el usuario admin del dashboard (manual, fuera de este script)
-- =============================================================================
-- El primer admin de un tenant NO se puede invitar desde el panel (ese flujo usa
-- el tenant del invitador). Hay que crearlo a mano:
--
--   a) Supabase Studio → Authentication → Add user → email + password de Alejandra.
--      Copiar el user_id (UUID) generado.
--
--   b) Vincularla a su tenant como admin (reemplazar <USER_ID> y, si corresponde,
--      el professional_id para que vea "su" agenda):
--
--   INSERT INTO public.dashboard_users (user_id, tenant_id, role, full_name, email,
--                                       professional_id, is_active)
--   SELECT '<USER_ID>'::uuid,
--          t.tenant_id, 'admin', 'Alejandra Calivar', 'alejandra.calivar@example.com',
--          (SELECT professional_id FROM professionals WHERE tenant_id=t.tenant_id LIMIT 1),
--          TRUE
--   FROM tenants t WHERE t.slug = 'alejandra-calivar'
--   ON CONFLICT (user_id) DO NOTHING;
--
--   c) El custom_access_token_hook inyectará tenant_id + app_role en el JWT al
--      próximo login. Alejandra ya puede entrar al dashboard.
-- =============================================================================
