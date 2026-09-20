-- 061 — ISADI (2026-08-06): recepción reportó que no podía cargar más turnos en
-- un mismo horario ("ya hay 3 cargados y no me deja seguir").
--
-- Causa: el cupo se cuenta POR PROFESIONAL sumando TODOS los servicios (ver 058
-- y `enforce_slot_capacity`), no por servicio. Con el cupo 6 de la migración 059,
-- 3 turnos de Fisioterapia + 3 de Rehabilitación física del mismo profesional ya
-- agotaban el horario, aunque en pantalla recepción viera solo 3.
--
-- Decisión del cliente: subir el cupo de 6 → 8 en los tres servicios del grupo
-- fisioterapia. Aplicado directo en producción el 2026-08-06 (no requiere deploy;
-- el agente de WhatsApp consume la misma RPC y lo hereda).
UPDATE services
   SET capacity_per_slot = 8
 WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
   AND name IN ('Fisioterapia', 'Kinesiología', 'Rehabilitación física');
