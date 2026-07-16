-- Migration 054: RPC atómica para agendar sesiones de un paquete (deferred-work 2026-07-16)
-- ============================================================================
-- Cierra el BLOCKER de integridad + el HIGH de appointment huérfano registrados
-- en deferred-work.md (review de spec-agendado-paquetes-fecha-hora-automatico):
--
--   • Blocker — cupo e índices sin lock: `POST /api/treatments/[id]/sessions`
--     leía treatments+appointments, calculaba `por_agendar` y `max(session_index)+1`
--     en JS y recién después creaba. Dos requests paralelos del MISMO paquete
--     leían el mismo estado, ambos pasaban el chequeo → superaban total_sessions
--     y REPETÍAN session_index.
--
--   • High — turno huérfano: el turno se creaba con `create_appointment` (029) y
--     recién en un UPDATE POSTERIOR se ligaba package_id/session_index/color. Si
--     ese UPDATE fallaba, quedaba un appointment creado pero desligado del paquete.
--
-- Esta RPC resuelve ambos DE UNA: corre en UNA transacción (función plpgsql),
-- toma `FOR UPDATE` sobre la fila del treatment (serializa las corridas
-- concurrentes del mismo paquete), recalcula cupo y session_index BAJO ESE LOCK
-- (autoritativo), y crea+liga cada turno dentro de un savepoint por slot: si el
-- ligado falla, se revierte también el INSERT → nunca queda un turno huérfano.
--
-- REUSA `create_appointment` (029) para NO duplicar el candado anti-overbooking
-- por profesional, la idempotencia ni la validación service_professionals. La
-- llamada anidada corre en la misma transacción; su propio EXCEPTION interno
-- captura unique_violation/errores sin abortar esta función.
--
-- CRÍTICO (AR14): SECURITY DEFINER (bypassa RLS, igual que 029). El aislamiento
-- de tenant NO depende de RLS acá: se garantiza por el `WHERE tenant_id = p_org_id`
-- explícito al tomar el lock y por `create_appointment` que recibe p_org_id. El
-- route pasa p_org_id = tenant_id del JWT (nunca del body).
--
-- Contrato de retorno pensado para que el route arme la MISMA respuesta HTTP de
-- hoy (creadas + skipped[{start_at, reason}]) sin cambiar el frontend.
--
-- DB-only. NO se aplica automáticamente: el usuario la aplica en EasyPanel/prod.
-- Idempotente (CREATE OR REPLACE). El route que la invoca NO funciona en prod
-- hasta que esta migración esté aplicada — deployar ambos juntos.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_package_sessions(
  p_org_id       uuid,
  p_treatment_id uuid,
  p_slots        jsonb,          -- [{ start_at, end_at, professional_id? }, ...]
  p_color        text DEFAULT NULL,
  p_booked_via   text DEFAULT 'manual'
)
 RETURNS TABLE(creadas integer, skipped jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_patient_id     uuid;
  v_service_id     uuid;
  v_fixed_prof     uuid;     -- professional_id fijo del paquete (o NULL = "cualquiera")
  v_total          integer;
  v_status         text;
  v_agendadas      integer;  -- turnos NO cancelados del paquete YA existentes (bajo lock)
  v_next_index     integer;  -- próximo session_index correlativo (bajo lock)
  v_creadas        integer := 0;
  v_skipped        jsonb   := '[]'::jsonb;
  v_slot           jsonb;
  v_start_txt      text;
  v_start          timestamptz;
  v_end            timestamptz;
  v_prof           uuid;
  v_ca             RECORD;
BEGIN
  -- ── Lock del treatment: serializa las corridas concurrentes del MISMO paquete.
  --    Un segundo request del mismo paquete ESPERA acá hasta el commit del primero
  --    y recién entonces ve sus appointments → cupo/índice consistentes. Paquetes
  --    distintos bloquean filas distintas → no se estorban.
  SELECT patient_id, service_id, professional_id, total_sessions, status
    INTO v_patient_id, v_service_id, v_fixed_prof, v_total, v_status
    FROM treatments
   WHERE treatment_id = p_treatment_id AND tenant_id = p_org_id
   FOR UPDATE;

  -- Defensas (el route ya valida 404/409 antes; esto cubre carreras raras).
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, jsonb_build_array(jsonb_build_object('reason', 'treatment_not_found'));
    RETURN;
  END IF;
  IF v_status <> 'active' THEN
    RETURN QUERY SELECT 0, jsonb_build_array(jsonb_build_object('reason', 'treatment_not_active'));
    RETURN;
  END IF;

  -- ── Cupo autoritativo BAJO LOCK: "agendadas" = turnos NO cancelados del paquete
  --    (mismo criterio honesto que treatmentProgress / el route). `por_agendar`
  --    implícito = v_total - v_agendadas.
  SELECT COUNT(*)
    INTO v_agendadas
    FROM appointments
   WHERE package_id = p_treatment_id
     AND status IN ('confirmed', 'completed', 'no_show', 'pending_calendar');

  -- ── Próximo session_index BAJO LOCK: max existente del paquete + 1.
  SELECT COALESCE(MAX(session_index), 0) + 1
    INTO v_next_index
    FROM appointments
   WHERE package_id = p_treatment_id;

  -- ── Un slot por vez, EN ORDEN. Cada creación exitosa consume cupo e índice.
  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
    v_start_txt := v_slot ->> 'start_at';

    -- Cupo: cortar cuando (previas + creadas en esta corrida) alcanza el total.
    -- Los slots restantes se informan como 'no_capacity' (nunca se sobre-agenda).
    IF v_agendadas + v_creadas >= v_total THEN
      v_skipped := v_skipped || jsonb_build_object('start_at', v_start_txt, 'reason', 'no_capacity');
      CONTINUE;
    END IF;

    -- Profesional efectivo: el fijo del paquete, o el que trae ESTE slot
    -- ("cualquier profesional"). Sin ninguno → no se puede crear.
    v_prof := COALESCE(v_fixed_prof, NULLIF(v_slot ->> 'professional_id', '')::uuid);
    IF v_prof IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('start_at', v_start_txt, 'reason', 'missing_professional');
      CONTINUE;
    END IF;

    -- Savepoint por slot: create_appointment + UPDATE del ligado son atómicos.
    -- Si algo lanza (fecha inválida, CHECK de color, error en el ligado), se
    -- revierte SOLO este slot (incluido su INSERT) → sin huérfano, sin abortar
    -- el resto del lote.
    BEGIN
      v_start := (v_slot ->> 'start_at')::timestamptz;
      v_end   := (v_slot ->> 'end_at')::timestamptz;

      SELECT * INTO v_ca
        FROM create_appointment(
          p_org_id          => p_org_id,
          p_patient_id      => v_patient_id,
          p_service_id      => v_service_id,
          p_start           => v_start,
          p_end             => v_end,
          p_appointment_id  => gen_random_uuid(),
          p_professional_id => v_prof,
          p_booked_via      => p_booked_via
        );

      IF v_ca.success IS NOT TRUE OR v_ca.appointment_id IS NULL THEN
        -- p.ej. professional_service_mismatch (no rompe el lote).
        v_skipped := v_skipped || jsonb_build_object('start_at', v_start_txt, 'reason', COALESCE(v_ca.error, 'create_failed'));
        CONTINUE;
      END IF;

      IF v_ca.duplicate THEN
        -- El slot ya estaba ocupado (candado/idempotencia 029): NO consume cupo
        -- ni session_index. Se informa como conflicto, no como creado.
        v_skipped := v_skipped || jsonb_build_object('start_at', v_start_txt, 'reason', 'slot_conflict');
        CONTINUE;
      END IF;

      -- Ligar el turno NUEVO al paquete EN LA MISMA TRANSACCIÓN. color = el único
      -- de la tanda si se pasó (Pedido 6); si p_color es NULL, no toca el color.
      UPDATE appointments
         SET package_id    = p_treatment_id,
             session_index = v_next_index,
             color         = COALESCE(p_color, color)
       WHERE appointment_id = v_ca.appointment_id;

      v_creadas    := v_creadas + 1;
      v_next_index := v_next_index + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Rollback del savepoint de ESTE slot (deshace el INSERT si lo hubo).
      v_skipped := v_skipped || jsonb_build_object('start_at', v_start_txt, 'reason', 'link_error');
    END;
  END LOOP;

  RETURN QUERY SELECT v_creadas, v_skipped;
END;
$function$;

COMMENT ON FUNCTION public.create_package_sessions(uuid, uuid, jsonb, text, text) IS
  'Agenda sesiones de un paquete de forma ATÓMICA (054). Toma FOR UPDATE del treatment, recalcula cupo (turnos no cancelados) y session_index bajo ese lock, y crea+liga cada turno reusando create_appointment (029) dentro de un savepoint por slot (sin sobre-cupo, sin session_index repetido, sin turno huérfano). Retorna (creadas int, skipped jsonb[{start_at,reason}]). Reasons: no_capacity | missing_professional | slot_conflict | create_failed/<error> | link_error. SECURITY DEFINER: aislamiento de tenant por WHERE tenant_id=p_org_id explícito.';

-- Solo usuarios autenticados pueden llamar la RPC (el route valida rol admin/receptionist
-- y pasa p_org_id = tenant del JWT; el aislamiento real lo da el WHERE tenant_id interno).
GRANT EXECUTE ON FUNCTION public.create_package_sessions(uuid, uuid, jsonb, text, text) TO authenticated;
