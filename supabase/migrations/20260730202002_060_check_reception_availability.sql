-- ============================================================================
-- Migration 060 — Disponibilidad manual de Recepción para horarios de hoy
-- ============================================================================
--
-- Esta RPC es una copia deliberadamente aislada del núcleo de disponibilidad
-- de la migración 058. La RPC estándar conserva `slot_start > NOW()` y, por lo
-- tanto, mantiene intacta la semántica futura del agente y demás consumidores.
--
-- Diferencia única de negocio:
--   * una recepcionista puede consultar todos los slots con cupo del día de hoy,
--     aunque su hora de inicio ya haya transcurrido;
--   * fechas anteriores a hoy (definido en America/Argentina/Buenos_Aires)
--     siguen prohibidas;
--   * fechas futuras se comportan igual que la disponibilidad estándar.
--
-- La autorización se verifica dentro de la función SECURITY DEFINER: tenant y
-- rol salen del JWT, no de la confianza en el llamador.

CREATE OR REPLACE FUNCTION public.check_reception_availability(
  p_org_id uuid,
  p_date date,
  p_timezone text DEFAULT 'America/Argentina/Buenos_Aires'::text,
  p_service_id uuid DEFAULT NULL::uuid,
  p_professional_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(available boolean, shifts jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dow SMALLINT;
  v_avail BOOLEAN;
  v_shifts JSONB;
  v_jwt JSONB;
  v_jwt_tenant UUID;
  v_role TEXT;
  v_today_ba DATE;
BEGIN
  IF p_timezone IS DISTINCT FROM 'America/Argentina/Buenos_Aires' THEN
    RAISE EXCEPTION 'timezone no autorizado'
      USING ERRCODE = '22023';
  END IF;

  v_jwt := auth.jwt();
  v_role := COALESCE(v_jwt ->> 'app_role', v_jwt ->> 'role');
  v_today_ba := (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE;

  BEGIN
    v_jwt_tenant := NULLIF(v_jwt ->> 'tenant_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'tenant_id inválido en el JWT'
      USING ERRCODE = '42501';
  END;

  IF v_role IS DISTINCT FROM 'receptionist' THEN
    RAISE EXCEPTION 'check_reception_availability requiere rol receptionist'
      USING ERRCODE = '42501';
  END IF;

  IF v_jwt_tenant IS NULL OR v_jwt_tenant IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'tenant_id no autorizado'
      USING ERRCODE = '42501';
  END IF;

  IF p_date < v_today_ba THEN
    RAISE EXCEPTION 'No se puede consultar disponibilidad de fechas anteriores a hoy'
      USING ERRCODE = '22023';
  END IF;

  v_dow := ((EXTRACT(ISODOW FROM p_date))::INT - 1)::SMALLINT;
  WITH
  svc AS (
    SELECT s.service_id, s.name AS service_name,
           COALESCE(s.duration_minutes,30) AS duration_minutes,
           COALESCE(s.require_referral,FALSE) AS require_referral,
           COALESCE(s.capacity_per_slot,1) AS capacity_per_slot
    FROM services s
    WHERE s.tenant_id=p_org_id
      AND s.active=TRUE
      AND s.booking_mode='appointment'
      AND (p_service_id IS NULL OR s.service_id=p_service_id)
  ),
  sh_slots AS (
    SELECT svc.service_id, svc.service_name, svc.require_referral,
           svc.capacity_per_slot, sh.slot_duration_minutes AS dur_min,
           sp.professional_id, pr.name AS professional_name,
           slot_ts AS slot_start_local,
           slot_ts + (sh.slot_duration_minutes * INTERVAL '1 minute') AS slot_end_local
    FROM svc
    JOIN service_hours sh
      ON sh.service_id=svc.service_id AND sh.day_of_week=v_dow AND sh.active=TRUE
    JOIN service_professionals sp ON sp.service_id=svc.service_id
    JOIN professionals pr
      ON pr.professional_id=sp.professional_id
     AND pr.tenant_id=p_org_id
     AND pr.active=TRUE
    CROSS JOIN LATERAL generate_series(
      (p_date+sh.start_time)::TIMESTAMP,
      (p_date+sh.end_time)::TIMESTAMP
        - (sh.slot_duration_minutes*INTERVAL '1 minute'),
      sh.slot_duration_minutes*INTERVAL '1 minute'
    ) AS slot_ts
    WHERE NOT EXISTS (
        SELECT 1 FROM service_exceptions se
        WHERE se.service_id=svc.service_id AND se.exception_date=p_date
      )
      AND (p_professional_id IS NULL OR sp.professional_id=p_professional_id)
      AND NOT EXISTS (
        SELECT 1 FROM blocked_times bt
        WHERE bt.professional_id=sp.professional_id
          AND p_date BETWEEN bt.date_from AND bt.date_to
      )
      AND NOT EXISTS (
        SELECT 1 FROM clinic_day_status cds
        WHERE cds.tenant_id=p_org_id
          AND cds.status_date=p_date
          AND cds.is_open=FALSE
      )
      AND NOT EXISTS (
        SELECT 1 FROM holidays h
        WHERE h.country='AR'
          AND h.holiday_date=p_date
          AND NOT EXISTS (
            SELECT 1 FROM clinic_day_status cds2
            WHERE cds2.tenant_id=p_org_id
              AND cds2.status_date=p_date
              AND cds2.is_open=TRUE
          )
      )
  ),
  ps_slots AS (
    SELECT svc.service_id, svc.service_name, svc.require_referral,
           svc.capacity_per_slot, svc.duration_minutes AS dur_min,
           sp.professional_id, pr.name AS professional_name,
           slot_ts AS slot_start_local,
           slot_ts + (svc.duration_minutes*INTERVAL '1 minute') AS slot_end_local
    FROM svc
    JOIN service_professionals sp ON sp.service_id=svc.service_id
    JOIN professionals pr
      ON pr.professional_id=sp.professional_id
     AND pr.tenant_id=p_org_id
     AND pr.active=TRUE
    JOIN professional_schedules ps
      ON ps.professional_id=sp.professional_id AND ps.day_of_week=v_dow
    CROSS JOIN LATERAL generate_series(
      (p_date+ps.start_time)::TIMESTAMP,
      (p_date+ps.end_time)::TIMESTAMP
        - (svc.duration_minutes*INTERVAL '1 minute'),
      svc.duration_minutes*INTERVAL '1 minute'
    ) AS slot_ts
    WHERE NOT EXISTS (
        SELECT 1 FROM service_hours sh2
        WHERE sh2.service_id=svc.service_id
          AND sh2.day_of_week=v_dow
          AND sh2.active=TRUE
      )
      AND (p_professional_id IS NULL OR sp.professional_id=p_professional_id)
      AND NOT EXISTS (
        SELECT 1 FROM blocked_times bt
        WHERE bt.professional_id=sp.professional_id
          AND p_date BETWEEN bt.date_from AND bt.date_to
      )
      AND NOT EXISTS (
        SELECT 1 FROM clinic_day_status cds
        WHERE cds.tenant_id=p_org_id
          AND cds.status_date=p_date
          AND cds.is_open=FALSE
      )
      AND NOT EXISTS (
        SELECT 1 FROM holidays h
        WHERE h.country='AR'
          AND h.holiday_date=p_date
          AND NOT EXISTS (
            SELECT 1 FROM clinic_day_status cds2
            WHERE cds2.tenant_id=p_org_id
              AND cds2.status_date=p_date
              AND cds2.is_open=TRUE
          )
      )
  ),
  all_slots AS (
    SELECT service_id, service_name, require_referral, capacity_per_slot,
           dur_min, professional_id, professional_name, slot_start_local,
           slot_end_local
    FROM sh_slots
    UNION
    SELECT service_id, service_name, require_referral, capacity_per_slot,
           dur_min, professional_id, professional_name, slot_start_local,
           slot_end_local
    FROM ps_slots
  ),
  free AS (
    SELECT s.service_id, s.service_name, s.require_referral,
           s.professional_id, s.professional_name,
           s.slot_start_local AT TIME ZONE p_timezone AS slot_start_utc,
           s.slot_end_local AT TIME ZONE p_timezone AS slot_end_utc
    FROM all_slots s
    WHERE (
        SELECT COUNT(*) FROM appointments a
        WHERE a.tenant_id=p_org_id
          AND a.professional_id=s.professional_id
          AND a.start_at=s.slot_start_local AT TIME ZONE p_timezone
          AND a.status IN ('confirmed','pending_calendar')
      ) < s.capacity_per_slot
      -- 060: hoy completo para Recepción; a futuro conserva la regla de 058.
      AND (
        p_date = v_today_ba
        OR s.slot_start_local AT TIME ZONE p_timezone > NOW()
      )
  ),
  avail AS (
    SELECT DISTINCT ON (f.service_id, f.slot_start_utc)
           f.service_id, f.service_name, f.require_referral,
           f.professional_id, f.professional_name,
           f.slot_start_utc, f.slot_end_utc
    FROM free f
    ORDER BY f.service_id, f.slot_start_utc, f.professional_name
  )
  SELECT COUNT(*)>0,
         COALESCE(
           JSONB_AGG(
             JSONB_BUILD_OBJECT(
               'open',TO_CHAR(slot_start_utc AT TIME ZONE p_timezone,'HH24:MI'),
               'close',TO_CHAR(slot_end_utc AT TIME ZONE p_timezone,'HH24:MI'),
               'slot_start_iso',TO_CHAR(
                 (slot_start_utc AT TIME ZONE 'UTC')::TIMESTAMP,
                 'YYYY-MM-DD"T"HH24:MI:SS"Z"'
               ),
               'slot_end_iso',TO_CHAR(
                 (slot_end_utc AT TIME ZONE 'UTC')::TIMESTAMP,
                 'YYYY-MM-DD"T"HH24:MI:SS"Z"'
               ),
               'service_id',service_id::TEXT,
               'service_name',service_name,
               'require_referral',require_referral,
               'professional_id',professional_id::TEXT,
               'professional_name',professional_name,
               'elapsed_today',
                 p_date = v_today_ba AND slot_start_utc <= NOW()
             )
             ORDER BY slot_start_utc
           ),
           '[]'::JSONB
         )
  INTO v_avail, v_shifts
  FROM avail;

  RETURN QUERY
    SELECT COALESCE(v_avail,FALSE), COALESCE(v_shifts,'[]'::JSONB);
END;
$function$;

COMMENT ON FUNCTION public.check_reception_availability(uuid,date,text,uuid,uuid) IS
  'Disponibilidad manual 060: paridad con check_clinic_availability 058, pero una recepcionista autenticada puede ver slots con cupo ya transcurridos del día actual de Buenos Aires. Prohíbe otros roles, tenants y fechas anteriores.';

REVOKE ALL ON FUNCTION public.check_reception_availability(uuid,date,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_reception_availability(uuid,date,text,uuid,uuid)
  TO authenticated;
