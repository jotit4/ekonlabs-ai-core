-- ============================================================================
-- Migration 058 — Cupo de N turnos por profesional en el MISMO horario
-- ============================================================================
-- 2026-07-27
--
-- PEDIDO (ISADI, audios del 27/07 — recepción + Aldo)
-- ----------------------------------------------------------------------------
-- "Por hora damos seis turnos. Guardamos uno a las 8, queremos guardar otro a
--  las 8 y nos da la opción de 8:15."
--
-- En la sala de rehabilitación se atiende a varios pacientes en la MISMA hora
-- (rotan por camillas/aparatos). El modelo actual asume 1 paciente por
-- profesional por horario, así que al ocuparse las 08:00 el sistema empuja al
-- siguiente hueco libre (08:15 con el paso de 15 min vigente).
--
-- QUÉ LO IMPEDÍA (dos candados, hay que levantar los dos)
-- ----------------------------------------------------------------------------
-- 1. `idx_appointments_no_overlap_professional` (migración 029): índice UNIQUE
--    parcial (tenant_id, professional_id, start_at) → el 2º INSERT en el mismo
--    horario falla con 23505.
-- 2. `check_clinic_availability`: el CTE `free` descartaba el slot con un
--    NOT EXISTS — alcanzaba UN turno para que el horario dejara de ofrecerse.
--
-- `services.capacity_per_slot` ya existía (migración 006) y ya valía 6 en los
-- servicios de rehabilitación, pero NADIE lo leía: quedó de cuando Kinesiología
-- y Fisioterapia eran booking_mode='gated'/'cycle' (clases con cupo). Esta
-- migración lo convierte en el dato que gobierna el cupo del slot.
--
-- DECISIÓN DE PRODUCTO (confirmada con el usuario el 2026-07-27)
-- ----------------------------------------------------------------------------
-- El cupo se cuenta POR PROFESIONAL Y HORARIO, no por servicio: el recurso
-- escaso es el kinesiólogo y sus camillas. Patricia puede tener 6 pacientes a
-- las 08:00 SUMANDO todos los servicios que atiende, no 6 de cada uno.
--
--   límite del slot = COALESCE(services.capacity_per_slot, 1) del servicio que
--                     se está reservando
--   ocupación       = TODOS los turnos activos de ese profesional en ese
--                     start_at exacto, sin importar el servicio
--
-- Con capacity_per_slot NULL (el default) el comportamiento es EXACTAMENTE el
-- de hoy: un turno por profesional por horario. Esta migración no cambia nada
-- para ningún tenant hasta que se cargue un cupo > 1 (ver migración de datos al
-- final, que solo toca Fisioterapia de ISADI).
--
-- ALCANCE: igual que el índice que reemplaza — solo turnos CON professional_id.
-- Los modos cycle/gated/walk_in crean turnos sin profesional y quedan fuera,
-- sin cambio de comportamiento.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- (a) CANDADO NUEVO — trigger de capacidad en lugar del índice UNIQUE
-- ────────────────────────────────────────────────────────────────────────────
--
-- Un índice UNIQUE no puede expresar "hasta N filas iguales", así que el
-- candado pasa a ser un trigger. La atomicidad frente a dos reservas
-- simultáneas del mismo slot la da `pg_advisory_xact_lock`: serializa por
-- (tenant, profesional, horario) dentro de la transacción, de modo que el
-- COUNT y el INSERT no puedan intercalarse con los de otra sesión.
--
-- ERRCODE 23505 (unique_violation) A PROPÓSITO: toda la cadena que ya existía
-- para el candado viejo sigue funcionando sin tocarla —
-- `/api/appointments` traduce 23505 → 409 `slot_conflict`, y create_appointment
-- ya captura unique_violation.

CREATE OR REPLACE FUNCTION public.enforce_slot_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_capacity INT;
  v_taken    INT;
BEGIN
  -- Fuera de alcance: turnos sin profesional (cycle/gated/walk_in y legacy) y
  -- estados no activos (cancelled/completed/no_show no ocupan cupo).
  IF NEW.professional_id IS NULL OR NEW.status NOT IN ('confirmed', 'pending_calendar') THEN
    RETURN NEW;
  END IF;

  -- UPDATE que no toca la identidad del slot ni reactiva un turno inactivo:
  -- no hay nada que revalidar (ej.: marcar attendance_confirmed, poner color).
  IF TG_OP = 'UPDATE'
     AND OLD.professional_id IS NOT DISTINCT FROM NEW.professional_id
     AND OLD.start_at        IS NOT DISTINCT FROM NEW.start_at
     AND OLD.service_id      IS NOT DISTINCT FROM NEW.service_id
     AND OLD.status IN ('confirmed', 'pending_calendar')
  THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(s.capacity_per_slot, 1) INTO v_capacity
  FROM services s
  WHERE s.service_id = NEW.service_id;

  -- Servicio inexistente (no debería pasar: hay FK) → el mínimo seguro.
  v_capacity := COALESCE(v_capacity, 1);

  -- Serializa las reservas concurrentes de ESTE slot. Se libera solo al
  -- terminar la transacción.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.tenant_id::TEXT || ':' || NEW.professional_id::TEXT || ':' || NEW.start_at::TEXT,
      0
    )
  );

  SELECT COUNT(*) INTO v_taken
  FROM appointments a
  WHERE a.tenant_id       = NEW.tenant_id
    AND a.professional_id = NEW.professional_id
    AND a.start_at        = NEW.start_at
    AND a.status IN ('confirmed', 'pending_calendar')
    AND a.appointment_id <> NEW.appointment_id;

  IF v_taken >= v_capacity THEN
    RAISE EXCEPTION
      'slot_full: el profesional ya tiene % turno(s) en ese horario (cupo %)',
      v_taken, v_capacity
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_slot_capacity() IS
  'Anti-overbooking con cupo (058): permite hasta services.capacity_per_slot turnos activos del MISMO profesional en el mismo start_at (default 1). Reemplaza al índice idx_appointments_no_overlap_professional de la migración 029. Lanza 23505 para que /api/appointments lo siga traduciendo a 409 slot_conflict.';

DROP TRIGGER IF EXISTS trg_enforce_slot_capacity ON public.appointments;

CREATE TRIGGER trg_enforce_slot_capacity
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_slot_capacity();

-- El índice UNIQUE ya no puede convivir con el cupo: bloquearía el 2º turno
-- antes de que el trigger pueda contar. Lo reemplaza el trigger de arriba.
-- Se conserva un índice NO único con las mismas columnas: el COUNT del trigger
-- y el de check_clinic_availability lo necesitan.
DROP INDEX IF EXISTS public.idx_appointments_no_overlap_professional;

CREATE INDEX IF NOT EXISTS idx_appointments_professional_slot
  ON public.appointments (tenant_id, professional_id, start_at)
  WHERE professional_id IS NOT NULL
    AND status IN ('confirmed', 'pending_calendar');

COMMENT ON INDEX public.idx_appointments_professional_slot IS
  'Soporta el COUNT de ocupación por (tenant, profesional, horario) de enforce_slot_capacity() y check_clinic_availability (058). NO es único: el cupo lo controla el trigger.';


-- ────────────────────────────────────────────────────────────────────────────
-- (b) DISPONIBILIDAD — el horario se sigue ofreciendo mientras haya cupo
-- ────────────────────────────────────────────────────────────────────────────
--
-- Reescrita desde la definición REAL de prod (pg_get_functiondef del
-- 2026-07-27). Cambio mínimo: `capacity_per_slot` viaja por los CTEs y el
-- NOT EXISTS de `free` pasa a ser un COUNT contra ese cupo. TODO lo demás
-- (modelo híbrido service_hours/professional_schedules, LUNES=0,
-- service_exceptions, blocked_times, clinic_day_status, holidays, timezone,
-- filtro > NOW(), DISTINCT ON por profesional alfabético) queda textual.
--
-- Firma y contrato de retorno intactos → el agente Python no se entera.

CREATE OR REPLACE FUNCTION public.check_clinic_availability(
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
  v_dow SMALLINT; v_avail BOOLEAN; v_shifts JSONB;
BEGIN
  v_dow := ((EXTRACT(ISODOW FROM p_date))::INT - 1)::SMALLINT;
  WITH
  svc AS (
    SELECT s.service_id, s.name AS service_name, COALESCE(s.duration_minutes,30) AS duration_minutes,
           COALESCE(s.require_referral,FALSE) AS require_referral,
           -- 058: cupo de pacientes por horario y profesional (default 1)
           COALESCE(s.capacity_per_slot,1) AS capacity_per_slot
    FROM services s
    WHERE s.tenant_id=p_org_id AND s.active=TRUE AND s.booking_mode='appointment' AND (p_service_id IS NULL OR s.service_id=p_service_id)
  ),
  sh_slots AS (
    SELECT svc.service_id, svc.service_name, svc.require_referral, svc.capacity_per_slot, sh.slot_duration_minutes AS dur_min,
           sp.professional_id, pr.name AS professional_name,
           slot_ts AS slot_start_local, slot_ts + (sh.slot_duration_minutes * INTERVAL '1 minute') AS slot_end_local
    FROM svc
    JOIN service_hours sh ON sh.service_id=svc.service_id AND sh.day_of_week=v_dow AND sh.active=TRUE
    JOIN service_professionals sp ON sp.service_id=svc.service_id
    JOIN professionals pr ON pr.professional_id=sp.professional_id AND pr.tenant_id=p_org_id AND pr.active=TRUE
    CROSS JOIN LATERAL generate_series((p_date+sh.start_time)::TIMESTAMP, (p_date+sh.end_time)::TIMESTAMP - (sh.slot_duration_minutes*INTERVAL '1 minute'), sh.slot_duration_minutes*INTERVAL '1 minute') AS slot_ts
    WHERE NOT EXISTS (SELECT 1 FROM service_exceptions se WHERE se.service_id=svc.service_id AND se.exception_date=p_date)
      AND (p_professional_id IS NULL OR sp.professional_id=p_professional_id)
      AND NOT EXISTS (SELECT 1 FROM blocked_times bt WHERE bt.professional_id=sp.professional_id AND p_date BETWEEN bt.date_from AND bt.date_to)
      AND NOT EXISTS (SELECT 1 FROM clinic_day_status cds WHERE cds.tenant_id=p_org_id AND cds.status_date=p_date AND cds.is_open=FALSE)
      AND NOT EXISTS (
        SELECT 1 FROM holidays h
        WHERE h.country='AR' AND h.holiday_date=p_date
          AND NOT EXISTS (SELECT 1 FROM clinic_day_status cds2 WHERE cds2.tenant_id=p_org_id AND cds2.status_date=p_date AND cds2.is_open=TRUE)
      )
  ),
  ps_slots AS (
    SELECT svc.service_id, svc.service_name, svc.require_referral, svc.capacity_per_slot, svc.duration_minutes AS dur_min,
           sp.professional_id, pr.name AS professional_name,
           slot_ts AS slot_start_local, slot_ts + (svc.duration_minutes*INTERVAL '1 minute') AS slot_end_local
    FROM svc
    JOIN service_professionals sp ON sp.service_id=svc.service_id
    JOIN professionals pr ON pr.professional_id=sp.professional_id AND pr.tenant_id=p_org_id AND pr.active=TRUE
    JOIN professional_schedules ps ON ps.professional_id=sp.professional_id AND ps.day_of_week=v_dow
    CROSS JOIN LATERAL generate_series((p_date+ps.start_time)::TIMESTAMP, (p_date+ps.end_time)::TIMESTAMP - (svc.duration_minutes*INTERVAL '1 minute'), svc.duration_minutes*INTERVAL '1 minute') AS slot_ts
    WHERE NOT EXISTS (SELECT 1 FROM service_hours sh2 WHERE sh2.service_id=svc.service_id AND sh2.day_of_week=v_dow AND sh2.active=TRUE)
      AND (p_professional_id IS NULL OR sp.professional_id=p_professional_id)
      AND NOT EXISTS (SELECT 1 FROM blocked_times bt WHERE bt.professional_id=sp.professional_id AND p_date BETWEEN bt.date_from AND bt.date_to)
      AND NOT EXISTS (SELECT 1 FROM clinic_day_status cds WHERE cds.tenant_id=p_org_id AND cds.status_date=p_date AND cds.is_open=FALSE)
      AND NOT EXISTS (
        SELECT 1 FROM holidays h
        WHERE h.country='AR' AND h.holiday_date=p_date
          AND NOT EXISTS (SELECT 1 FROM clinic_day_status cds2 WHERE cds2.tenant_id=p_org_id AND cds2.status_date=p_date AND cds2.is_open=TRUE)
      )
  ),
  all_slots AS (
    SELECT service_id, service_name, require_referral, capacity_per_slot, dur_min, professional_id, professional_name, slot_start_local, slot_end_local FROM sh_slots
    UNION
    SELECT service_id, service_name, require_referral, capacity_per_slot, dur_min, professional_id, professional_name, slot_start_local, slot_end_local FROM ps_slots
  ),
  free AS (
    SELECT s.service_id, s.service_name, s.require_referral, s.professional_id, s.professional_name,
           s.slot_start_local AT TIME ZONE p_timezone AS slot_start_utc, s.slot_end_local AT TIME ZONE p_timezone AS slot_end_utc
    FROM all_slots s
    -- 058: el horario se ofrece mientras la ocupación del PROFESIONAL en ese
    -- start_at (todos sus servicios) sea menor al cupo del servicio pedido.
    -- Con capacity_per_slot=1 equivale al NOT EXISTS anterior.
    WHERE (
        SELECT COUNT(*) FROM appointments a
        WHERE a.tenant_id=p_org_id
          AND a.professional_id=s.professional_id
          AND a.start_at=s.slot_start_local AT TIME ZONE p_timezone
          AND a.status IN ('confirmed','pending_calendar')
      ) < s.capacity_per_slot
      AND s.slot_start_local AT TIME ZONE p_timezone > NOW()
  ),
  avail AS (
    SELECT DISTINCT ON (f.service_id, f.slot_start_utc)
           f.service_id, f.service_name, f.require_referral, f.professional_id, f.professional_name,
           f.slot_start_utc, f.slot_end_utc
    FROM free f
    ORDER BY f.service_id, f.slot_start_utc, f.professional_name
  )
  SELECT COUNT(*)>0, COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('open',TO_CHAR(slot_start_utc AT TIME ZONE p_timezone,'HH24:MI'),'close',TO_CHAR(slot_end_utc AT TIME ZONE p_timezone,'HH24:MI'),'slot_start_iso',TO_CHAR((slot_start_utc AT TIME ZONE 'UTC')::TIMESTAMP,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),'slot_end_iso',TO_CHAR((slot_end_utc AT TIME ZONE 'UTC')::TIMESTAMP,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),'service_id',service_id::TEXT,'service_name',service_name,'require_referral',require_referral,'professional_id',professional_id::TEXT,'professional_name',professional_name) ORDER BY slot_start_utc),'[]'::JSONB)
  INTO v_avail, v_shifts FROM avail;
  RETURN QUERY SELECT COALESCE(v_avail,FALSE), COALESCE(v_shifts,'[]'::JSONB);
END;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- (c) create_appointment — el "duplicado" es del MISMO paciente, no del slot
-- ────────────────────────────────────────────────────────────────────────────
--
-- BUG QUE ESTA MIGRACIÓN CORRIGE (latente hasta hoy, grave a partir del cupo):
-- el chequeo de duplicado buscaba CUALQUIER turno en (profesional, horario) sin
-- mirar de quién era, y lo devolvía como si fuera del paciente que estaba
-- reservando — con el short_id de otra persona. Con 1 turno por slot casi nunca
-- se disparaba; con cupo 6 sería el caso normal: el 2º paciente de las 08:00
-- recibiría "ya tenés un turno" y el código de turno de un tercero.
--
-- Ahora, para turnos CON profesional: duplicado = mismo paciente, mismo
-- profesional, mismo horario. Si el slot está lleno pero el paciente no tiene
-- turno ahí, se devuelve success=FALSE con error 'slot_full' (el agente lo
-- reporta como fallo en vez de inventar un turno existente).
--
-- La rama SIN profesional (cycle/gated/legacy) queda EXACTAMENTE como estaba:
-- fuera del alcance de este pedido.

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_org_id uuid,
  p_patient_id uuid,
  p_service_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_appointment_id uuid DEFAULT NULL::uuid,
  p_professional_id uuid DEFAULT NULL::uuid,
  p_booked_via text DEFAULT 'whatsapp'::text,
  p_short_id text DEFAULT NULL::text
)
RETURNS TABLE(success boolean, appointment_id uuid, short_id text, duplicate boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_apt_id UUID; v_existing UUID; v_existing_short TEXT; v_capacity INT; v_taken INT;
BEGIN
  v_apt_id := COALESCE(p_appointment_id, gen_random_uuid());

  IF p_professional_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM service_professionals sp
      JOIN professionals pr ON pr.professional_id=sp.professional_id AND pr.tenant_id=p_org_id AND pr.active=TRUE
      WHERE sp.service_id=p_service_id AND sp.professional_id=p_professional_id
    ) THEN
      RETURN QUERY SELECT FALSE, v_apt_id, NULL::TEXT, FALSE, 'professional_service_mismatch: el profesional no atiende este servicio'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF p_professional_id IS NOT NULL THEN
    -- 058: duplicado = el MISMO paciente ya tiene ese turno.
    SELECT a.appointment_id, a.short_id INTO v_existing, v_existing_short
    FROM appointments a WHERE a.tenant_id=p_org_id AND a.professional_id=p_professional_id AND a.patient_id=p_patient_id AND a.start_at=p_start AND a.status IN ('confirmed','pending_calendar') LIMIT 1;
  ELSE
    SELECT a.appointment_id, a.short_id INTO v_existing, v_existing_short
    FROM appointments a WHERE a.tenant_id=p_org_id AND a.service_id=p_service_id AND a.start_at=p_start AND a.status IN ('confirmed','pending_calendar') LIMIT 1;
  END IF;
  IF v_existing IS NOT NULL THEN RETURN QUERY SELECT TRUE, v_existing, v_existing_short, TRUE, NULL::TEXT; RETURN; END IF;

  -- 058: cupo del slot ANTES de insertar, para devolver un error propio en vez
  -- de chocar contra el trigger (cuyo 23505 el agente leería como duplicado).
  IF p_professional_id IS NOT NULL THEN
    SELECT COALESCE(s.capacity_per_slot,1) INTO v_capacity FROM services s WHERE s.service_id=p_service_id;
    v_capacity := COALESCE(v_capacity,1);

    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_org_id::TEXT || ':' || p_professional_id::TEXT || ':' || p_start::TEXT, 0)
    );

    SELECT COUNT(*) INTO v_taken
    FROM appointments a
    WHERE a.tenant_id=p_org_id AND a.professional_id=p_professional_id AND a.start_at=p_start
      AND a.status IN ('confirmed','pending_calendar');

    IF v_taken >= v_capacity THEN
      RETURN QUERY SELECT FALSE, v_apt_id, NULL::TEXT, FALSE, 'slot_full: no hay cupo disponible en ese horario'::TEXT;
      RETURN;
    END IF;
  END IF;

  BEGIN
    INSERT INTO appointments (appointment_id, tenant_id, patient_id, service_id, start_at, end_at, status, booked_via, professional_id, short_id)
    VALUES (v_apt_id, p_org_id, p_patient_id, p_service_id, p_start, p_end, 'confirmed', p_booked_via, p_professional_id, p_short_id);
    RETURN QUERY SELECT TRUE, v_apt_id, p_short_id, FALSE, NULL::TEXT;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_professional_id IS NOT NULL THEN
        SELECT a.appointment_id, a.short_id INTO v_existing, v_existing_short FROM appointments a WHERE a.tenant_id=p_org_id AND a.professional_id=p_professional_id AND a.patient_id=p_patient_id AND a.start_at=p_start AND a.status IN ('confirmed','pending_calendar') LIMIT 1;
        -- Sin turno propio en ese horario, un 23505 acá solo puede venir del
        -- trigger de cupo (carrera perdida) → error real, no duplicado.
        IF v_existing IS NULL THEN
          RETURN QUERY SELECT FALSE, v_apt_id, NULL::TEXT, FALSE, 'slot_full: no hay cupo disponible en ese horario'::TEXT;
          RETURN;
        END IF;
      ELSE
        SELECT a.appointment_id, a.short_id INTO v_existing, v_existing_short FROM appointments a WHERE a.tenant_id=p_org_id AND a.service_id=p_service_id AND a.start_at=p_start AND a.status IN ('confirmed','pending_calendar') LIMIT 1;
      END IF;
      RETURN QUERY SELECT TRUE, COALESCE(v_existing,v_apt_id), v_existing_short, TRUE, NULL::TEXT;
    WHEN OTHERS THEN RETURN QUERY SELECT FALSE, v_apt_id, NULL::TEXT, FALSE, SQLERRM;
  END;
END;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- (d) DATOS ISADI — Fisioterapia: 1 turno por hora, 6 pacientes por horario
-- ────────────────────────────────────────────────────────────────────────────
--
-- Audio 2: "los turnos de fisio son cada una hora y el último se da a las 5, no
-- es cada media hora". Fisioterapia no tiene service_hours → los slots salen de
-- professional_schedules (Patricia y Aldo, 08:00–18:00) con paso =
-- duration_minutes. Con 60 min la serie queda 08:00, 09:00 … 17:00 exacto.
--
-- capacity_per_slot ya valía 6 en Fisioterapia → 6 pacientes por hora, todos
-- con la misma hora de inicio, que es lo que pidieron.
UPDATE public.services SET duration_minutes = 60
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4' AND name = 'Fisioterapia';

-- Kinesiología y Rehabilitación física arrastran capacity_per_slot=6 de la
-- migración 012, cuando eran servicios con cupo grupal. Hoy ese 6 es inerte;
-- al activarse el cupo pasarían a aceptar 6 pacientes por cada slot de 15 min
-- (24 por hora) sin que nadie lo haya pedido. Se llevan a NULL para conservar
-- su comportamiento actual: 1 turno por profesional y horario.
--
-- Si más adelante ISADI quiere el mismo esquema que Fisioterapia, alcanza con
-- duration_minutes=60 y capacity_per_slot=6 en estas dos filas.
UPDATE public.services SET capacity_per_slot = NULL
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
  AND name IN ('Kinesiología', 'Rehabilitación física');
