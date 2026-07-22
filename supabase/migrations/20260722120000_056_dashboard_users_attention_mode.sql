-- ============================================================================
-- 056 — Subtipo de usuario por MODO DE ATENCIÓN (pedido ISADI 2026-07-22)
-- ============================================================================
--
-- Distingue dos subtipos de usuario que atiende pacientes:
--
--   * 'walk_in'     → "Doctor-fila": atiende POR ORDEN DE LLEGADA. Al iniciar
--                     sesión entra directo a SU día en el Calendario (vista Día
--                     filtrada por él): necesita ver la fila del día, no una
--                     lista de turnos agendados.
--   * 'appointment' → "Doctor-turno": atiende POR TURNOS. Conserva la landing
--                     de su rol (doctor → /mi-jornada).
--
-- ORTOGONAL AL ROL a propósito: el director de la clínica es `role='admin'` y
-- ADEMÁS atiende por orden de llegada. Si el subtipo viviera dentro del rol,
-- marcarlo como doctor le quitaría Configuración/Métricas/Usuarios. Por eso es
-- una columna aparte y la landing la resuelve el par (professional_id,
-- attention_mode), no el rol.
--
-- NULL = el usuario no atiende pacientes (recepción, admin puro) → sin efecto.

ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS attention_mode TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_users_attention_mode_check'
  ) THEN
    ALTER TABLE public.dashboard_users
      ADD CONSTRAINT dashboard_users_attention_mode_check
      CHECK (attention_mode IS NULL OR attention_mode IN ('walk_in', 'appointment'));
  END IF;
END $$;

COMMENT ON COLUMN public.dashboard_users.attention_mode IS
  'Subtipo de atención (056): walk_in = "Doctor-fila" (orden de llegada, entra a su día en el Calendario) | appointment = "Doctor-turno" (landing de su rol) | NULL = no atiende pacientes. Ortogonal a `role`: un admin puede atender por fila sin perder permisos. La landing la resuelve el par (professional_id, attention_mode) — ver src/lib/landing.ts.';

-- Backfill conservador: todo usuario YA vinculado a un profesional pasa a
-- 'appointment', que reproduce exactamente la landing que tenía hasta ahora
-- (doctor → /mi-jornada, admin → /inicio). Nadie cambia de comportamiento por
-- esta migración; el paso a 'walk_in' es una decisión explícita por usuario.
UPDATE public.dashboard_users
SET attention_mode = 'appointment'
WHERE professional_id IS NOT NULL
  AND attention_mode IS NULL;

-- Índice parcial: la landing consulta por user_id (ya indexado por la PK/unique),
-- pero el listado de usuarios filtra por subtipo al mostrar la columna.
CREATE INDEX IF NOT EXISTS idx_dashboard_users_attention_mode
  ON public.dashboard_users (tenant_id, attention_mode)
  WHERE attention_mode IS NOT NULL;
