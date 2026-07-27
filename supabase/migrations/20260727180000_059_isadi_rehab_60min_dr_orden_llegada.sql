-- ============================================================================
-- Migration 059 — ISADI: rehabilitación de a 1 hora y el Dr. Juan Diego fuera
--                 del circuito de turnos con hora
-- ============================================================================
-- 2026-07-27  (continúa la 058, misma tanda de feedback)
--
-- (a) Kinesiología y Rehabilitación física al mismo esquema que Fisioterapia
-- ----------------------------------------------------------------------------
-- La 058 solo tocó Fisioterapia y dejó a estos dos en 15 min. El problema: el
-- botón "Dar un turno" de recepción NO trabaja por servicio sino por GRUPO
-- (reception_group='fisioterapia') y une los horarios de todos sus servicios,
-- así que recepción seguía viendo 08:15 / 08:30 / 08:45 en la misma lista —
-- aportados por estos dos, no por Fisioterapia. Los tres los dan Patricia y
-- Aldo en la misma sala, así que van con la misma regla:
--   paso de 1 hora (08:00 … 17:00) y 6 pacientes por horario.
UPDATE public.services
SET duration_minutes  = 60,
    capacity_per_slot = 6
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
  AND name IN ('Kinesiología', 'Rehabilitación física');

-- (b) El Dr. Juan Diego Rodríguez atiende SOLO por orden de llegada
-- ----------------------------------------------------------------------------
-- Confirmado por el usuario el 2026-07-27. Revierte la decisión del 2026-07-17
-- (ver Epic 16 / project_isadi_walk_in_orden_llegada), tomada cuando la cola de
-- orden de llegada todavía no existía y la única forma de anotarle pacientes
-- era darle turnos con hora. Hoy la cola existe (recepción "Anotar llegada" +
-- vista del Dr en la agenda), así que el circuito de turnos con hora sobra y
-- ensucia la agenda.
--
-- b.1 — Consulta traumatología la comparte con el Dr. Villavicencio. Se lo saca
--       a él del servicio: los turnos con hora de traumatología quedan solo con
--       Villavicencio (lun-vie 13:00–15:00, su horario real).
DELETE FROM public.service_professionals
WHERE service_id = (
        SELECT service_id FROM public.services
        WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
          AND name = 'Consulta traumatología'
      )
  AND professional_id = 'c686d654-0c61-4ca2-b041-477fae971aad';

-- b.2 — Rehabilitación traumatológica es SU servicio (único profesional) y es
--       el que alimenta la cola. Pasa a booking_mode='walk_in':
--         · check_clinic_availability solo mira booking_mode='appointment'
--           → deja de ofrecer horarios (dashboard Y agente de WhatsApp).
--         · el modal "Dar un turno" solo lista servicios 'appointment'
--           → desaparece de ahí.
--         · el agente, ante un servicio que no es 'appointment', responde con
--           información y NO intenta reservar (app/fsm/engine.py); en el menú
--           lo etiqueta "sin turno".
--         · la cola NO se toca: /api/appointments/walk-in y el panel de
--           recepción dependen de allow_walk_in, no de booking_mode.
--
--       Verificado antes de aplicar: el Dr. no tenía NINGÚN turno futuro, así
--       que no se pierde nada agendado. Los service_hours quedan cargados por
--       si alguna vez vuelve a 'appointment'.
--
--       Para revertir: UPDATE ... SET booking_mode='appointment'.
UPDATE public.services
SET booking_mode = 'walk_in'
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
  AND name = 'Rehabilitación traumatológica';
