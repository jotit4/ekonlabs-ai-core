-- Migration 048: Abrir la capa clínica al rol `receptionist` (ISADI)
-- Esquema AUTORITATIVO: en ISADI recepción hace casi todo el trabajo administrativo
-- y clínico de carga. El diseño original del Epic 14 (HCE) candó estas tablas a
-- doctor/admin por Ley 25.326; el cliente pidió expresamente que recepción pueda
-- VER y EDITAR toda la ficha del paciente. Decisión de negocio consciente (2026-07-07).
--
-- Complementa los guards de API Route (ALLOWED_ROLES) y los gates de UI, que se
-- amplían a 'receptionist' en el mismo cambio. Sin este ALTER, recepción pasaría el
-- guard de la app pero la RLS le devolvería 0 filas / rechazaría el write.
--
-- ALTER POLICY es idempotente (reescribe la definición): seguro de reaplicar.
--
-- Alcance del cambio (agrega 'receptionist' al ARRAY de roles permitidos):
--   clinical_notes : SELECT + INSERT  (UPDATE se deja como estaba — autoría:
--                    autor propio OR admin; recepción edita las notas que crea)
--   session_notes  : SELECT + INSERT + UPDATE   (DELETE sigue bloqueado: false)
--   treatment_plans: SELECT + INSERT + UPDATE   (DELETE sigue bloqueado: false)
--
-- Las columnas clínicas que viven en `patients` (antecedentes/alergias/medicacion/
-- cirugias) NO necesitan cambio de RLS: la RLS de `patients` es por tenant, sin
-- distinción de rol — su apertura a recepción es 100% de capa de aplicación
-- (guard de /api/patients/[id]/clinical-data + gate del panel).
--
-- DB-only. Esta migración NO se aplica automáticamente: el usuario la aplica en EasyPanel.

-- ── clinical_notes ────────────────────────────────────────────────────────────
ALTER POLICY clinical_notes_select_own ON public.clinical_notes
  USING (
    ((tenant_id)::text = COALESCE((auth.jwt() ->> 'tenant_id'::text), ''::text))
    AND ((auth.jwt() ->> 'app_role'::text) = ANY (ARRAY['doctor'::text, 'admin'::text, 'receptionist'::text]))
  );

ALTER POLICY clinical_notes_insert_own ON public.clinical_notes
  WITH CHECK (
    ((tenant_id)::text = COALESCE((auth.jwt() ->> 'tenant_id'::text), ''::text))
    AND (author_id = auth.uid())
    AND ((auth.jwt() ->> 'app_role'::text) = ANY (ARRAY['doctor'::text, 'admin'::text, 'receptionist'::text]))
  );

-- ── session_notes (evolución por sesión) ──────────────────────────────────────
ALTER POLICY session_notes_select_own ON public.session_notes
  USING (
    ((tenant_id)::text = COALESCE((auth.jwt() ->> 'tenant_id'::text), ''::text))
    AND (COALESCE((auth.jwt() ->> 'app_role'::text), (auth.jwt() ->> 'role'::text)) = ANY (ARRAY['doctor'::text, 'admin'::text, 'receptionist'::text]))
  );

ALTER POLICY session_notes_insert_own ON public.session_notes
  WITH CHECK (
    ((tenant_id)::text = COALESCE((auth.jwt() ->> 'tenant_id'::text), ''::text))
    AND (COALESCE((auth.jwt() ->> 'app_role'::text), (auth.jwt() ->> 'role'::text)) = ANY (ARRAY['doctor'::text, 'admin'::text, 'receptionist'::text]))
  );

ALTER POLICY session_notes_update_own ON public.session_notes
  USING (
    ((tenant_id)::text = COALESCE((auth.jwt() ->> 'tenant_id'::text), ''::text))
    AND (COALESCE((auth.jwt() ->> 'app_role'::text), (auth.jwt() ->> 'role'::text)) = ANY (ARRAY['doctor'::text, 'admin'::text, 'receptionist'::text]))
  )
  WITH CHECK (
    ((tenant_id)::text = COALESCE((auth.jwt() ->> 'tenant_id'::text), ''::text))
    AND (COALESCE((auth.jwt() ->> 'app_role'::text), (auth.jwt() ->> 'role'::text)) = ANY (ARRAY['doctor'::text, 'admin'::text, 'receptionist'::text]))
  );

-- ── treatment_plans (plan / alta) ─────────────────────────────────────────────
ALTER POLICY treatment_plans_select_own ON public.treatment_plans
  USING (
    ((tenant_id)::text = COALESCE((auth.jwt() ->> 'tenant_id'::text), ''::text))
    AND (COALESCE((auth.jwt() ->> 'app_role'::text), (auth.jwt() ->> 'role'::text)) = ANY (ARRAY['doctor'::text, 'admin'::text, 'receptionist'::text]))
  );

ALTER POLICY treatment_plans_insert_own ON public.treatment_plans
  WITH CHECK (
    ((tenant_id)::text = COALESCE((auth.jwt() ->> 'tenant_id'::text), ''::text))
    AND (COALESCE((auth.jwt() ->> 'app_role'::text), (auth.jwt() ->> 'role'::text)) = ANY (ARRAY['doctor'::text, 'admin'::text, 'receptionist'::text]))
  );

ALTER POLICY treatment_plans_update_own ON public.treatment_plans
  USING (
    ((tenant_id)::text = COALESCE((auth.jwt() ->> 'tenant_id'::text), ''::text))
    AND (COALESCE((auth.jwt() ->> 'app_role'::text), (auth.jwt() ->> 'role'::text)) = ANY (ARRAY['doctor'::text, 'admin'::text, 'receptionist'::text]))
  )
  WITH CHECK (
    ((tenant_id)::text = COALESCE((auth.jwt() ->> 'tenant_id'::text), ''::text))
    AND (COALESCE((auth.jwt() ->> 'app_role'::text), (auth.jwt() ->> 'role'::text)) = ANY (ARRAY['doctor'::text, 'admin'::text, 'receptionist'::text]))
  );
