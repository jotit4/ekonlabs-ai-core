-- 057 — Consulta traumatología + horarios reales de traumatología (ISADI)
--
-- Pedido de campo ISADI (reunión 2026-07-24): que el agente de WhatsApp ofrezca
-- "Consulta traumatología" dentro de la opción 1 ("Sacar un turno").
--
-- SOLO DATOS del tenant ISADI — no cambia schema. YA APLICADA en prod el
-- 2026-07-24; se versiona para trazabilidad y para poder reproducir el estado.
--
-- Contexto del modelo (importante para entender por qué NO se cargan
-- `service_hours` al servicio nuevo):
--   `check_clinic_availability` NO intersecta `service_hours` con
--   `professional_schedules`: si el servicio tiene `service_hours` para ese día
--   los usa y IGNORA la agenda personal de cada profesional; solo cuando NO hay
--   `service_hours` cae en `professional_schedules`. Como los horarios son por
--   SERVICIO y no por (servicio, profesional), un servicio compartido por dos
--   doctores con franjas distintas solo puede respetarlas dejándolo SIN
--   `service_hours`.
--
-- Nota sobre `day_of_week`: la RPC calcula `ISODOW - 1`, o sea LUNES = 0.

BEGIN;

-- ─── 1. Servicio nuevo, atendido por los dos traumatólogos ───────────────────
-- Sin `service_hours` a propósito (ver cabecera): cada doctor aporta su propia
-- franja desde `professional_schedules`.
-- `reception_group='fisioterapia'` para que sus turnos se vean en /agenda bajo
-- el botón Fisioterapia (decisión del usuario 2026-07-24). Contrapartida
-- conocida y aceptada: el modal simplificado de recepción reserva con el primer
-- servicio del grupo que tenga hueco, así que puede caer en este servicio.
INSERT INTO services (tenant_id, name, calendar_id, professional_name,
                      duration_minutes, active, booking_mode, reception_group)
VALUES ('5298fcc5-15bf-494c-9655-b49d759cfef4', 'Consulta traumatología',
        'PLACEHOLDER_CONSULTA_TRAUMATOLOGIA@group.calendar.google.com', NULL,
        15, true, 'appointment', 'fisioterapia');

INSERT INTO service_professionals (service_id, professional_id)
SELECT s.service_id, p.professional_id
FROM services s CROSS JOIN professionals p
WHERE s.tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
  AND s.name = 'Consulta traumatología'
  AND p.tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
  AND p.name IN ('Dr. Juan Diego Rodríguez', 'Dr. Villavicencio');

-- ─── 2. Agenda real del Dr. Villavicencio: 13:00-15:00 ───────────────────────
-- Estaba cargada 08:00-18:00, que no es su horario real (dato del usuario
-- 2026-07-24). Efecto colateral buscado: "Traumatología (Dr. Villavicencio)"
-- no tiene `service_hours`, así que pasa a ofrecer turnos 13-15 — antes no
-- ofrecía NINGUNO porque el servicio estaba en el menú del agente sin horarios.
UPDATE professional_schedules
SET start_time = '13:00:00', end_time = '15:00:00'
WHERE professional_id = '8f5d29ea-93b6-432c-8ce6-690f825f867c';

-- ─── 3. Fix: días corridos en "Rehabilitación traumatológica" ────────────────
-- Sus `service_hours` estaban en day_of_week 1..5, que con LUNES=0 significa
-- MARTES a SÁBADO. Efectos en producción: se ofrecían turnos los SÁBADOS
-- (la clínica no atiende) y los LUNES caía en la agenda personal del Dr,
-- ofreciendo desde las 08:00 en vez de las 09:00. No había ningún turno dado en
-- sábado, así que la corrección no toca datos existentes.
UPDATE service_hours
SET day_of_week = day_of_week - 1
WHERE service_id = '407ad166-03ef-4187-be07-064602241edf';

COMMIT;

-- Verificado con la RPC tras aplicar (lunes 2026-07-27 / sábado 2026-07-25):
--   Rehabilitación traumatológica → lunes 09:00-18:00 (36 slots), sábado 0
--   Traumatología (Dr. Villavicencio) → lunes 13:00-15:00 (8 slots), sábado 0
--   Consulta traumatología → lunes 08:00-18:00 (40 slots), sábado 0
--
-- LIMITACIÓN CONOCIDA de "Consulta traumatología": la RPC hace
-- DISTINCT ON (service_id, slot_start) ORDER BY professional_name, así que en
-- los horarios donde los dos doctores están libres se ofrece siempre al
-- Dr. Juan Diego (gana el desempate alfabético). El Dr. Villavicencio aparece
-- solo cuando Juan Diego ya está ocupado en ese horario.
