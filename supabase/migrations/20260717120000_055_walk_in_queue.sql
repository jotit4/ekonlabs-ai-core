-- ============================================================================
-- Migration 055 — Cola de orden de llegada (walk-in) para recepción
-- ============================================================================
-- Pedido ISADI 2026-07-17: el Dr Juan Diego (Rehabilitación traumatológica)
-- atiende MIXTO (turnos con hora + orden de llegada). Se reusa la tabla
-- `appointments` con un flag `is_walk_in`; el servicio se marca elegible con
-- `services.allow_walk_in`. Un walk-in NO reserva un slot horario: start_at es
-- la HORA DE LLEGADA y ordena la cola.
--
-- Aditiva e idempotente (IF NOT EXISTS). DB-only: el usuario la aplica en
-- EasyPanel/Supabase de producción. El cambio estructural NO enciende la cola
-- en ningún servicio (ver DATA STEP comentado al final).
-- ============================================================================

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS allow_walk_in boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.services.allow_walk_in IS
  'Si TRUE, el servicio admite cola por orden de llegada (walk-in) además de turnos con hora. Flag por servicio (pedido ISADI 2026-07-17). NULL/false = sin cola.';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_walk_in boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.appointments.is_walk_in IS
  'Si TRUE, el turno es un walk-in (cola por orden de llegada): start_at = hora de llegada, NO reserva un slot horario. NO debe mostrarse en la grilla horaria (agenda/proximos), solo en el panel de cola.';

-- Índice parcial para listar la cola de un servicio rápido (orden por hora de llegada).
CREATE INDEX IF NOT EXISTS idx_appointments_walk_in_queue
  ON public.appointments (tenant_id, service_id, start_at)
  WHERE is_walk_in;

-- ─────────────────────────────────────────────────────────────────────────────
-- DATA STEP — NO forma parte del cambio estructural. Encender la cola en el
-- servicio del Dr. El usuario lo ejecuta aparte en prod; el dev lo aplica en
-- local para poder probar el flujo. Ajustar el name exacto si difiere en la DB
-- destino.
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE public.services SET allow_walk_in = true
--   WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4'
--     AND name = 'Rehabilitación traumatológica';
