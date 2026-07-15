-- ============================================================================
-- Migration 052 — Feriados nacionales + estado del día (abre/no abre)
-- ============================================================================
-- 2026-07-15 — pedido real del cliente ISADI (reunión 2026-07-14):
-- "Agregar feriados nacionales con pregunta en calendario: '¿este día está
-- abierto o no?', y poder seleccionar si sí abre o no de forma fácil (en
-- vistas semana y mes)."
--
-- DECISIÓN DE PRODUCTO (ya tomada, no cambiar sin acuerdo explícito con el
-- cliente): un feriado nacional se considera CERRADO por defecto hasta que
-- alguien de la clínica marque explícitamente "Sí, abrimos". Es el lado
-- seguro: peor que no dar turnos es darlos y que el paciente venga a una
-- clínica cerrada. Mientras el feriado esté SIN DECIDIR o marcado CERRADO,
-- no se ofrecen huecos ese día — ni en el dashboard ni al agente de
-- WhatsApp (ambos usan `check_clinic_availability`). Un día que NO es
-- feriado sigue abierto normalmente salvo que la clínica lo cierre a mano.
--
-- MODELO DE DATOS
-- ----------------------------------------------------------------------------
-- (a) `holidays` — catálogo GLOBAL (no por tenant) de feriados nacionales.
--     Es un dato de calendario (Ley 27.399 + decretos anuales), no un dato de
--     negocio de cada clínica: todas las clínicas de Argentina comparten el
--     mismo calendario. Solo lectura para los tenants (RLS: SELECT abierto a
--     `authenticated`, sin INSERT/UPDATE/DELETE — solo se escribe por
--     migración/service_role). Sembrado con AR 2026 y 2027 más abajo.
--
-- (b) `clinic_day_status` — decisión de LA CLÍNICA (por tenant, con RLS) para
--     una fecha puntual: "abre" (is_open=true) o "no abre" (is_open=false).
--     Sirve TANTO para decidir un feriado nacional como para cerrar a mano un
--     día que NO es feriado (ej. se cortó el agua) — un solo modelo para
--     ambos casos, sin duplicar tablas. Guarda quién decidió y cuándo
--     (decided_by/decided_by_name/decided_at) además del audit_log estándar
--     (ver `logAudit` en la API route) — el audit_log es el registro de
--     auditoría canónico; estas columnas son para mostrar "quién decidió"
--     directo en la UI sin tener que joinear audit_logs.
--
-- La regla final "¿este día está abierto?" (aplicada en la RPC más abajo y
-- espejada en JS en `src/lib/agenda/day-status.ts` para la UI) es:
--   1. Si hay una fila en clinic_day_status para (tenant, fecha) → manda esa
--      decisión (is_open), sea o no feriado.
--   2. Si NO hay decisión y la fecha es feriado nacional → CERRADO (default).
--   3. Si NO hay decisión y NO es feriado → ABIERTO (comportamiento actual,
--      sin cambios para clínicas que no cargaron nada — ver sección RPC).
--
-- Aditiva y segura: ambas tablas son nuevas, no tocan filas existentes. La
-- RPC se reescribe con CREATE OR REPLACE preservando la firma y TODO el
-- comportamiento anterior — para un tenant sin ninguna fila en
-- clinic_day_status y sin feriados en el rango consultado, los dos NOT EXISTS
-- nuevos siempre son verdaderos (no encuentran nada) y el resultado es
-- IDÉNTICO al de antes de esta migración.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- (a) Catálogo global de feriados nacionales — solo lectura para tenants
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.holidays (
  holiday_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  country       text        NOT NULL DEFAULT 'AR',
  holiday_date  date        NOT NULL,
  name          text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays (holiday_date);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Catálogo global: cualquier usuario autenticado (de cualquier tenant) puede
-- LEER los feriados. No hay policy de INSERT/UPDATE/DELETE para `authenticated`
-- → el catálogo es de solo lectura desde la app (se mantiene por migración).
DROP POLICY IF EXISTS holidays_select_all ON public.holidays;
CREATE POLICY holidays_select_all
  ON public.holidays FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.holidays FROM anon;


-- ────────────────────────────────────────────────────────────────────────────
-- (b) Decisión de la clínica por día — por tenant, con RLS
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clinic_day_status (
  day_status_id   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  status_date     date        NOT NULL,
  is_open         boolean     NOT NULL,
  reason          text,
  decided_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by_name text,
  decided_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, status_date)
);

CREATE INDEX IF NOT EXISTS idx_clinic_day_status_tenant_date ON public.clinic_day_status (tenant_id, status_date);

ALTER TABLE public.clinic_day_status ENABLE ROW LEVEL SECURITY;

-- Políticas escritas ya optimizadas con `(select auth.<fn>())` (InitPlan, ver
-- razonamiento en migración 050) — al ser una tabla NUEVA no hace falta el
-- barrido de 050, se escribe directo en la forma recomendada.
DROP POLICY IF EXISTS clinic_day_status_select_own ON public.clinic_day_status;
CREATE POLICY clinic_day_status_select_own
  ON public.clinic_day_status FOR SELECT TO authenticated
  USING (tenant_id::text = COALESCE(((select auth.jwt()) ->> 'tenant_id'), ''));

DROP POLICY IF EXISTS clinic_day_status_insert_own ON public.clinic_day_status;
CREATE POLICY clinic_day_status_insert_own
  ON public.clinic_day_status FOR INSERT TO authenticated
  WITH CHECK (tenant_id::text = COALESCE(((select auth.jwt()) ->> 'tenant_id'), ''));

DROP POLICY IF EXISTS clinic_day_status_update_own ON public.clinic_day_status;
CREATE POLICY clinic_day_status_update_own
  ON public.clinic_day_status FOR UPDATE TO authenticated
  USING  (tenant_id::text = COALESCE(((select auth.jwt()) ->> 'tenant_id'), ''))
  WITH CHECK (tenant_id::text = COALESCE(((select auth.jwt()) ->> 'tenant_id'), ''));

DROP POLICY IF EXISTS clinic_day_status_delete_own ON public.clinic_day_status;
CREATE POLICY clinic_day_status_delete_own
  ON public.clinic_day_status FOR DELETE TO authenticated
  USING (tenant_id::text = COALESCE(((select auth.jwt()) ->> 'tenant_id'), ''));

REVOKE ALL ON TABLE public.clinic_day_status FROM anon;


-- ────────────────────────────────────────────────────────────────────────────
-- (c) Seed — feriados nacionales de Argentina 2026 y 2027
-- ────────────────────────────────────────────────────────────────────────────
-- Verificados contra AL MENOS DOS fuentes independientes por año (ver reporte
-- de la sesión que agregó esta migración para el detalle fuente-por-fuente).
-- Idempotente: ON CONFLICT (country, holiday_date) DO NOTHING.
--
-- 2026 (19 filas — 16 feriados nacionales + 3 días no laborables con fines
-- turísticos ya decretados): fechas trasladables YA con su fecha observada
-- (ej. Güemes 17/06 trasladado a 15/06 por caer miércoles, Ley 27.399 art.6).
--
-- 2027 (16 filas — SOLO inamovibles + trasladables, calculados con la regla
-- de Ley 27.399 art.6 y el algoritmo de Pascua): los "días no laborables con
-- fines turísticos" (puentes) para 2027 NO están sembrados — a la fecha de
-- esta migración el Poder Ejecutivo todavía no los decretó (se deciden
-- año a año, típicamente ~Q4 del año anterior). Cargar por migración aparte
-- cuando se publique el decreto. La Soberanía Nacional 2027 (20/11) cae
-- SÁBADO: por Decreto 614/2025 el traslado a lunes/viernes en ese caso es
-- DISCRECIONAL del Jefe de Gabinete (no automático) — se sembró en su fecha
-- legal (20/11, sábado) y debe revisarse cuando se publique el decreto anual.

INSERT INTO public.holidays (country, holiday_date, name) VALUES
  -- 2026
  ('AR', '2026-01-01', 'Año Nuevo'),
  ('AR', '2026-02-16', 'Carnaval'),
  ('AR', '2026-02-17', 'Carnaval'),
  ('AR', '2026-03-23', 'Día no laborable con fines turísticos'),
  ('AR', '2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia'),
  ('AR', '2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas'),
  ('AR', '2026-04-03', 'Viernes Santo'),
  ('AR', '2026-05-01', 'Día del Trabajador'),
  ('AR', '2026-05-25', 'Día de la Revolución de Mayo'),
  ('AR', '2026-06-15', 'Paso a la Inmortalidad del General Martín Miguel de Güemes'),
  ('AR', '2026-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano (Día de la Bandera)'),
  ('AR', '2026-07-09', 'Día de la Independencia'),
  ('AR', '2026-07-10', 'Día no laborable con fines turísticos'),
  ('AR', '2026-08-17', 'Paso a la Inmortalidad del General José de San Martín'),
  ('AR', '2026-10-12', 'Día del Respeto a la Diversidad Cultural'),
  ('AR', '2026-11-23', 'Día de la Soberanía Nacional'),
  ('AR', '2026-12-07', 'Día no laborable con fines turísticos'),
  ('AR', '2026-12-08', 'Inmaculada Concepción de María'),
  ('AR', '2026-12-25', 'Navidad'),
  -- 2027
  ('AR', '2027-01-01', 'Año Nuevo'),
  ('AR', '2027-02-08', 'Carnaval'),
  ('AR', '2027-02-09', 'Carnaval'),
  ('AR', '2027-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia'),
  ('AR', '2027-03-26', 'Viernes Santo'),
  ('AR', '2027-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas'),
  ('AR', '2027-05-01', 'Día del Trabajador'),
  ('AR', '2027-05-25', 'Día de la Revolución de Mayo'),
  ('AR', '2027-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano (Día de la Bandera)'),
  ('AR', '2027-06-21', 'Paso a la Inmortalidad del General Martín Miguel de Güemes'),
  ('AR', '2027-07-09', 'Día de la Independencia'),
  ('AR', '2027-08-16', 'Paso a la Inmortalidad del General José de San Martín'),
  ('AR', '2027-10-11', 'Día del Respeto a la Diversidad Cultural'),
  ('AR', '2027-11-20', 'Día de la Soberanía Nacional'),
  ('AR', '2027-12-08', 'Inmaculada Concepción de María'),
  ('AR', '2027-12-25', 'Navidad')
ON CONFLICT (country, holiday_date) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- (d) check_clinic_availability — excluir días cerrados (feriado sin decisión
--     "abre", o decisión explícita "no abre") en AMBOS branches
-- ────────────────────────────────────────────────────────────────────────────
--
-- Basada TEXTUALMENTE en la definición de la migración 029 (última versión
-- real en prod). Cambio MÍNIMO: se agregan DOS condiciones `NOT EXISTS` al
-- WHERE de `sh_slots` y de `ps_slots` (el mismo patrón que ya usan las
-- exclusiones de `service_exceptions`/`blocked_times` en esa misma migración):
--
--   1. NOT EXISTS decisión explícita "no abre" (clinic_day_status con
--      is_open=FALSE) para (tenant, fecha).
--   2. NOT EXISTS feriado para la fecha SIN una decisión explícita "abre" —
--      es decir: si es feriado Y no hay una fila is_open=TRUE, se excluye.
--
-- Combinadas, esas dos condiciones implementan exactamente la regla de
-- negocio: CERRADO si (decisión explícita "no abre") O (feriado sin decisión
-- "abre"); ABIERTO en cualquier otro caso — idéntico a `computeEffectiveOpen`
-- en `src/lib/agenda/day-status.ts` (JS), que es el espejo de esta lógica
-- para la UI.
--
-- SEGURIDAD: para un tenant/fecha SIN ninguna fila en clinic_day_status y SIN
-- fila en holidays para esa fecha (el caso de CUALQUIER clínica hoy, ya que
-- ambas tablas son nuevas y vacías salvo el seed de holidays), ambos
-- NOT EXISTS son verdaderos (no encuentran nada) → no excluyen nada → el
-- resultado de la RPC es IDÉNTICO al de antes de esta migración. Un feriado
-- sembrado (ej. 25/12) SÍ empieza a excluir turnos en TODOS los tenants desde
-- que se aplica esta migración, salvo que el tenant cargue una decisión
-- "abre" para esa fecha — es el comportamiento pedido por el cliente
-- ("cerrado por defecto").
--
-- PRESERVADO textualmente: todo lo demás de la migración 029 (modelo híbrido
-- service_hours/professional_schedules, filtro por profesional, colapso
-- DISTINCT ON, filtro > NOW(), shape de retorno, comentario de función salvo
-- el agregado de esta nota).

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
  -- (filtrado por p_professional_id si se pasó). Cada slot queda ligado a un
  -- profesional concreto del servicio.
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
      -- (052) Día cerrado por decisión explícita de la clínica.
      AND NOT EXISTS (SELECT 1 FROM clinic_day_status cds WHERE cds.tenant_id=p_org_id AND cds.status_date=p_date AND cds.is_open=FALSE)
      -- (052) Feriado nacional SIN decisión explícita "abre" → cerrado por defecto.
      AND NOT EXISTS (
        SELECT 1 FROM holidays h
        WHERE h.country='AR' AND h.holiday_date=p_date
          AND NOT EXISTS (SELECT 1 FROM clinic_day_status cds2 WHERE cds2.tenant_id=p_org_id AND cds2.status_date=p_date AND cds2.is_open=TRUE)
      )
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
      -- (052) Día cerrado por decisión explícita de la clínica.
      AND NOT EXISTS (SELECT 1 FROM clinic_day_status cds WHERE cds.tenant_id=p_org_id AND cds.status_date=p_date AND cds.is_open=FALSE)
      -- (052) Feriado nacional SIN decisión explícita "abre" → cerrado por defecto.
      AND NOT EXISTS (
        SELECT 1 FROM holidays h
        WHERE h.country='AR' AND h.holiday_date=p_date
          AND NOT EXISTS (SELECT 1 FROM clinic_day_status cds2 WHERE cds2.tenant_id=p_org_id AND cds2.status_date=p_date AND cds2.is_open=TRUE)
      )
  ),
  all_slots AS (
    SELECT service_id, service_name, require_referral, dur_min, professional_id, professional_name, slot_start_local, slot_end_local FROM sh_slots
    UNION
    SELECT service_id, service_name, require_referral, dur_min, professional_id, professional_name, slot_start_local, slot_end_local FROM ps_slots
  ),
  -- Descuento POR PROFESIONAL: un slot de (servicio, profesional, hora) está
  -- libre si ESE profesional no tiene un turno activo que arranque en ese slot.
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
  'Disponibilidad de turnos (029, extendida en 052). Modelo híbrido service_hours/professional_schedules preservado. Descuento de ocupados POR PROFESIONAL. (052) Excluye slots de un día CERRADO: decisión explícita clinic_day_status.is_open=FALSE, o feriado nacional (holidays) sin decisión explícita is_open=TRUE. Sin filas en clinic_day_status/holidays para el tenant/fecha, el comportamiento es idéntico al de la migración 029. shifts incluye professional_id/professional_name. Retorno TABLE(available bool, shifts jsonb) sin cambios.';
