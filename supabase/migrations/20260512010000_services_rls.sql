-- Migration: Enable RLS on services table
-- Story 6.3: CRUD de Servicios del Agente
-- La tabla services fue creada sin RLS — esta migration lo habilita.

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_select_own ON public.services;
CREATE POLICY services_select_own
ON public.services FOR SELECT TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS services_insert_own ON public.services;
CREATE POLICY services_insert_own
ON public.services FOR INSERT TO authenticated
WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

DROP POLICY IF EXISTS services_update_own ON public.services;
CREATE POLICY services_update_own
ON public.services FOR UPDATE TO authenticated
USING (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
WITH CHECK (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''));

-- No hay política DELETE — la desactivación es lógica (active = false), nunca física
REVOKE ALL ON TABLE public.services FROM anon;
