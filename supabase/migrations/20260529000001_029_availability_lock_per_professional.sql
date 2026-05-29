-- ============================================================================
-- Migration 029 — Disponibilidad y candado de turnos POR PROFESIONAL
-- ============================================================================
-- 2026-05-29  (REESCRITA desde las definiciones REALES de prod — ver nota)
--
-- ⚠️ NOTA DE PROCEDENCIA — LEER ANTES DE APLICAR
-- ----------------------------------------------------------------------------
-- La versión anterior de este archivo reescribía las dos RPCs A CIEGAS (sin el
-- cuerpo real), y al compararla contra prod resultaba destructiva: descartaba el
-- modelo híbrido service_hours / professional_schedules, los filtros de
-- service_exceptions y blocked_times, el manejo de timezone y el filtro > NOW(),
-- y cambiaba el contrato de retorno de create_appointment.
--
-- Esta versión parte de las DEFINICIONES REALES extraídas de prod
-- (pg_get_functiondef) y aplica SOLO el cambio mínimo necesario, preservando
-- TODO lo demás textualmente. Las firmas y los contratos de retorno se
-- conservan para no romper al agente Python:
--   check_clinic_availability -> TABLE(available boolean, shifts jsonb)
--   create_appointment        -> TABLE(success, appointment_id, short_id,
--                                       duplicate, error)
--
-- CONTEXTO / DECISIÓN DE PRODUCTO
-- ----------------------------------------------------------------------------
-- Hasta hoy la disponibilidad y el candado anti-overbooking eran POR SERVICIO
-- (índice UNIQUE en (tenant_id, service_id, start_at)). Ese modelo asume que
-- un servicio = una agenda = un cupo por slot.
--
-- La realidad de ISADI es N:N: un mismo servicio (Kinesiología, Fisioterapia,
-- Rehabilitación física) lo dan VARIOS profesionales. El recurso escaso que se
-- reserva NO es el servicio, es el PROFESIONAL: dos pacientes pueden tener
-- Kinesiología a las 09:00 si los atienden profesionales distintos.
--
-- Decisión de producto YA TOMADA: cuando un servicio lo dan varios
-- profesionales, EL PACIENTE ELIGE el profesional (no asignación automática).
--
-- Esta migración convierte disponibilidad + candado de "por servicio" a
-- "por profesional", SOLO para servicios booking_mode='appointment' con
-- profesional. Los modos cycle/gated/walk_in NO se tocan (pueden crear turnos
-- sin professional_id — no deben romperse).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- (a) CANDADO ANTI-OVERBOOKING POR PROFESIONAL
-- ────────────────────────────────────────────────────────────────────────────
--
-- Nuevo índice UNIQUE parcial: un profesional no puede tener dos turnos activos
-- en el mismo slot. Excluye professional_id IS NULL para no bloquear los turnos
-- de los modos cycle/gated/walk_in (que se crean sin profesional asignado) ni
-- los turnos legacy sin profesional.
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_no_overlap_professional
  ON public.appointments (tenant_id, professional_id, start_at)
  WHERE professional_id IS NOT NULL
    AND status IN ('confirmed', 'pending_calendar');

COMMENT ON INDEX public.idx_appointments_no_overlap_professional IS
  'Anti-overbooking POR PROFESIONAL (029): impide doble reserva del mismo profesional en el mismo slot. Solo aplica cuando professional_id IS NOT NULL (los modos cycle/gated/walk_in y turnos legacy quedan fuera). create_appointment captura la carrera vía unique_violation.';

-- ────────────────────────────────────────────────────────────────────────────
-- DECISIÓN SOBRE EL CANDADO VIEJO POR SERVICIO  → SE ELIMINA
-- ────────────────────────────────────────────────────────────────────────────
--
-- idx_appointments_no_overlap (tenant_id, service_id, start_at) de la migración
-- 010 causa SUB-RESERVA bajo el modelo por profesional: si dos profesionales
-- dan el mismo servicio, solo UNO podría tener un turno a las 09:00 — el segundo
-- paciente sería rechazado con 23505 aunque SU profesional esté libre.
--
-- Bajo el modelo "el paciente elige profesional" y "appointment SIEMPRE lleva
-- professional_id", el candado correcto es el de (a). Por eso se ELIMINA el de
-- servicio. Los modos cycle/gated/walk_in NO crean turnos al estilo appointment
-- (no pasan por create_appointment con slots), así que perder este índice no
-- los afecta.
--
-- ⚠️ RIESGO A CONFIRMAR ANTES DE APLICAR: si en prod existieran turnos
-- 'appointment' SIN professional_id (creados por el flujo viejo antes de esta
-- migración), quedarían sin protección anti-overbooking tras el DROP. Ver
-- "DATOS A CONFIRMAR" en el reporte. Si los hay, primero backfill de
-- professional_id, luego DROP.
DROP INDEX IF EXISTS public.idx_appointments_no_overlap;


-- ────────────────────────────────────────────────────────────────────────────
-- (b) check_clinic_availability — disponibilidad POR PROFESIONAL (opcional)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Basada TEXTUALMENTE en la definición real de prod. Cambios MÍNIMOS:
--   • Nuevo parámetro p_professional_id uuid DEFAULT NULL, AL FINAL de la firma
--     (no rompe llamadas posicionales ni por nombre existentes).
--   • Se asocia professional_id a cada slot en AMBOS branches (service_hours y
--     professional_schedules) cruzando con service_professionals.
--   • El descuento de turnos ocupados pasa a ser POR PROFESIONAL
--     (professional_id = slot.professional_id AND start_at = slot), NO por
--     service_id. Un slot solo se considera lleno si el profesional concreto
--     está ocupado. Cuando NO se pide profesional, un (servicio, hora) aparece
--     disponible si AL MENOS un profesional del servicio está libre (se elige el
--     primero libre) — corrige la sub-reserva del modelo viejo por service_id.
--   • Si p_professional_id se pasa: se filtran solo los slots de ese profesional.
--   • JSON de salida: se AGREGAN professional_id y professional_name (aditivo).
--     Las claves existentes (open, close, slot_start_iso, slot_end_iso,
--     service_id, service_name, require_referral) se preservan idénticas.
--
-- PRESERVADO textualmente: filtro booking_mode='appointment', require_referral
-- desde services, modelo híbrido service_hours/professional_schedules, uso de
-- slot_duration_minutes (sh) vs duration_minutes (ps), service_exceptions,
-- blocked_times, manejo de timezone, filtro > NOW(), v_dow = ISODOW-1, y el
-- shape de retorno TABLE(available boolean, shifts jsonb).

CREATE OR REPLACE FUNCTION public.check_clinic_availability(
  p_org_id          uuid,
  p_date            date,
  p_timezone        text DEFAULT 'America/Argentina/Buenos_Aires'::text,
  p_service_id      uuid DEFAULT NULL::uuid,
  p_professional_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(available boolean, shifts jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_dow SMALLINT; v_avail BOOLEAN; v_shifts JSONB;
BEGIN
  v_dow := ((EXTRACT(ISODOW FROM p_date))::INT - 1)::SMALLINT;
  WITH
  svc AS (
    SELECT s.service_id, s.name AS service_name, COALESCE(s.duration_minutes,30) AS duration_minutes, COALESCE(s.require_referral,FALSE) AS require_referral
    FROM services s
    WHERE s.tenant_id=p_org_id AND s.active=TRUE AND s.booking_mode='appointment' AND (p_service_id IS NULL OR s.service_id=p_service_id)
  ),
  -- BRANCH service_hours: ahora asocia profesional vía service_professionals
  -- (filtrado por p_professional_id si se pasó). Antes los slots de sh no tenían
  -- profesional; el descuento de ocupados era por service_id. Ahora cada slot
  -- queda ligado a un profesional concreto del servicio.
  sh_slots AS (
    SELECT svc.service_id, svc.service_name, svc.require_referral, sh.slot_duration_minutes AS dur_min,
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
  ),
  -- BRANCH professional_schedules: igual que el real, ahora también propaga el
  -- nombre del profesional. El gate "no hay service_hours para este servicio"
  -- se preserva idéntico.
  ps_slots AS (
    SELECT svc.service_id, svc.service_name, svc.require_referral, svc.duration_minutes AS dur_min,
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
  ),
  all_slots AS (
    SELECT service_id, service_name, require_referral, dur_min, professional_id, professional_name, slot_start_local, slot_end_local FROM sh_slots
    UNION
    SELECT service_id, service_name, require_referral, dur_min, professional_id, professional_name, slot_start_local, slot_end_local FROM ps_slots
  ),
  -- Descuento POR PROFESIONAL: un slot de (servicio, profesional, hora) está
  -- libre si ESE profesional no tiene un turno activo que arranque en ese slot.
  -- (Se conserva la condición a.start_at = slot del real, ahora ligada a
  -- professional_id en lugar de service_id.)
  free AS (
    SELECT s.service_id, s.service_name, s.require_referral, s.professional_id, s.professional_name,
           s.slot_start_local AT TIME ZONE p_timezone AS slot_start_utc, s.slot_end_local AT TIME ZONE p_timezone AS slot_end_utc
    FROM all_slots s
    WHERE NOT EXISTS (SELECT 1 FROM appointments a WHERE a.tenant_id=p_org_id AND a.professional_id=s.professional_id AND a.start_at=s.slot_start_local AT TIME ZONE p_timezone AND a.status IN ('confirmed','pending_calendar'))
      AND s.slot_start_local AT TIME ZONE p_timezone > NOW()
  ),
  -- Colapso: si NO se pidió profesional, un (servicio, hora) aparece una sola
  -- vez con el primer profesional libre. Si SE pidió profesional, no hay
  -- duplicación posible (el filtro ya restringió a uno).
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

COMMENT ON FUNCTION public.check_clinic_availability(uuid, date, text, uuid, uuid) IS
  'Disponibilidad de turnos (029). Modelo híbrido service_hours/professional_schedules preservado. Descuento de ocupados POR PROFESIONAL: si p_professional_id se pasa, devuelve solo los slots libres de ese profesional; si no, un (servicio,hora) aparece si al menos un profesional del servicio está libre (primer libre). shifts incluye professional_id/professional_name (aditivo). Retorno TABLE(available bool, shifts jsonb) sin cambios.';


-- ────────────────────────────────────────────────────────────────────────────
-- (c) create_appointment — idempotencia POR PROFESIONAL cuando hay profesional
-- ────────────────────────────────────────────────────────────────────────────
--
-- Basada TEXTUALMENTE en la definición real de prod. Cambios MÍNIMOS:
--   • Nuevo parámetro p_professional_id YA EXISTÍA en la firma real (DEFAULT
--     NULL). Se conserva exactamente la firma real (orden de parámetros y
--     defaults incluidos): p_org_id, p_patient_id, p_service_id, p_start, p_end,
--     p_appointment_id, p_professional_id, p_booked_via, p_short_id.
--   • La detección de duplicado/idempotencia pasa a ser por
--     (tenant, professional_id, start_at) CUANDO p_professional_id NO es NULL;
--     cuando es NULL se mantiene la detección por (tenant, service_id, start_at)
--     del comportamiento real (compat con flujos viejos y modos sin profesional).
--   • Validación OPCIONAL de idoneidad: si hay profesional, se verifica que
--     atienda el servicio (service_professionals); si no, se devuelve error
--     claro en el campo `error` (NO exception, NO rompe el shape). NO se valida
--     require_referral acá (lo maneja otro flujo).
--
-- PRESERVADO: idempotencia, status='confirmed', booked_via, columnas insertadas
-- (incluido short_id), manejo de unique_violation y OTHERS, y el shape de
-- retorno TABLE(success, appointment_id, short_id, duplicate, error).

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_org_id          uuid,
  p_patient_id      uuid,
  p_service_id      uuid,
  p_start           timestamptz,
  p_end             timestamptz,
  p_appointment_id  uuid DEFAULT NULL,
  p_professional_id uuid DEFAULT NULL,
  p_booked_via      text DEFAULT 'whatsapp',
  p_short_id        text DEFAULT NULL
)
 RETURNS TABLE(success boolean, appointment_id uuid, short_id text, duplicate boolean, error text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_apt_id UUID; v_existing UUID; v_existing_short TEXT;
BEGIN
  v_apt_id := COALESCE(p_appointment_id, gen_random_uuid());

  -- (opcional) idoneidad: el profesional debe atender el servicio. Error claro
  -- en `error`, sin romper el shape. Solo aplica cuando hay profesional.
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

  -- Idempotencia: por profesional si lo hay, por servicio si no (compat).
  IF p_professional_id IS NOT NULL THEN
    SELECT a.appointment_id, a.short_id INTO v_existing, v_existing_short
    FROM appointments a WHERE a.tenant_id=p_org_id AND a.professional_id=p_professional_id AND a.start_at=p_start AND a.status IN ('confirmed','pending_calendar') LIMIT 1;
  ELSE
    SELECT a.appointment_id, a.short_id INTO v_existing, v_existing_short
    FROM appointments a WHERE a.tenant_id=p_org_id AND a.service_id=p_service_id AND a.start_at=p_start AND a.status IN ('confirmed','pending_calendar') LIMIT 1;
  END IF;
  IF v_existing IS NOT NULL THEN RETURN QUERY SELECT TRUE, v_existing, v_existing_short, TRUE, NULL::TEXT; RETURN; END IF;

  BEGIN
    INSERT INTO appointments (appointment_id, tenant_id, patient_id, service_id, start_at, end_at, status, booked_via, professional_id, short_id)
    VALUES (v_apt_id, p_org_id, p_patient_id, p_service_id, p_start, p_end, 'confirmed', p_booked_via, p_professional_id, p_short_id);
    RETURN QUERY SELECT TRUE, v_apt_id, p_short_id, FALSE, NULL::TEXT;
  EXCEPTION
    WHEN unique_violation THEN
      -- Carrera atrapada por el candado. Re-leer con el mismo criterio de
      -- idempotencia para devolver el turno ganador.
      IF p_professional_id IS NOT NULL THEN
        SELECT a.appointment_id, a.short_id INTO v_existing, v_existing_short FROM appointments a WHERE a.tenant_id=p_org_id AND a.professional_id=p_professional_id AND a.start_at=p_start AND a.status IN ('confirmed','pending_calendar') LIMIT 1;
      ELSE
        SELECT a.appointment_id, a.short_id INTO v_existing, v_existing_short FROM appointments a WHERE a.tenant_id=p_org_id AND a.service_id=p_service_id AND a.start_at=p_start AND a.status IN ('confirmed','pending_calendar') LIMIT 1;
      END IF;
      RETURN QUERY SELECT TRUE, COALESCE(v_existing,v_apt_id), v_existing_short, TRUE, NULL::TEXT;
    WHEN OTHERS THEN RETURN QUERY SELECT FALSE, v_apt_id, NULL::TEXT, FALSE, SQLERRM;
  END;
END;
$function$;

COMMENT ON FUNCTION public.create_appointment(uuid, uuid, uuid, timestamptz, timestamptz, uuid, uuid, text, text) IS
  'Crea turno con idempotencia (029). Duplicado por (tenant, professional_id, start_at) cuando hay profesional; por (tenant, service_id, start_at) cuando es NULL (compat). Valida service_professionals si hay profesional (error en campo `error`, no exception). Conserva shape TABLE(success, appointment_id, short_id, duplicate, error) e idempotencia/unique_violation del original.';
