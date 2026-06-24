-- Migration 043: Contexto conversacional VIVO del agente en `thread_states` (P0 Bandeja IA)
--
-- PROBLEMA: el panel "Contexto del agente" de la Bandeja IA mostraba "Sin datos"
-- durante la conversación en curso porque el estado de comprensión del agente
-- (intención detectada, servicio en negociación, slot tentativo, datos recolectados)
-- vivía SOLO en memoria del grafo LangGraph y NUNCA se persistía. Solo se reflejaban
-- datos YA persistidos (patients + appointments confirmados).
--
-- SOLUCIÓN: una columna `agent_context jsonb` en `thread_states` donde el agente
-- upsertea, en cada turno relevante del grafo (service_role), el contexto vivo:
--   { detected_intent, service_requested, slot_tentative, dni, obra_social, current_step }
-- slot_tentative = el slot que se está negociando, NO el turno confirmado.
--
-- Puramente ADITIVA: solo ADD COLUMN IF NOT EXISTS. NO se modifican las policies RLS
-- existentes de `thread_states`:
--   - SELECT authenticated USING (tenant_id = jwt.tenant_id)  → el dashboard YA puede
--     leer esta columna nueva por RLS, sin cambios.
--   - INSERT/UPDATE/DELETE para authenticated = false  → solo el service_role del
--     agente escribe agent_context (igual que status/paused_reason).
--
-- DB-only. Esta migración NO se aplica automáticamente: la aplica el usuario/equipo
-- (EasyPanel / Supabase prod).

ALTER TABLE public.thread_states
  ADD COLUMN IF NOT EXISTS agent_context jsonb;

COMMENT ON COLUMN public.thread_states.agent_context IS
'Contexto conversacional VIVO del agente para el panel "Contexto del agente" de la '
'Bandeja IA. Estado de comprensión del grafo LangGraph durante la conversación en '
'curso (antes de que exista un turno confirmado en appointments). Lo upsertea el '
'agente con service_role en cada turno relevante. Claves: detected_intent, '
'service_requested, slot_tentative (slot en negociación, NO el confirmado), dni, '
'obra_social, current_step.';
