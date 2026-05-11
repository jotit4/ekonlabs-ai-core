-- Migration 004: Tabla obras_sociales con RLS y seed inicial
-- Story 3.3: Selector de obra social en cascada

CREATE TABLE IF NOT EXISTS public.obras_sociales (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  entidad     TEXT        NOT NULL,
  plan_nombre TEXT        NOT NULL,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_obras_sociales_entidad
  ON obras_sociales(entidad) WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_obras_sociales_tenant
  ON obras_sociales(tenant_id) WHERE tenant_id IS NOT NULL;

-- RLS
ALTER TABLE public.obras_sociales ENABLE ROW LEVEL SECURITY;

-- Política de lectura: registros globales (tenant_id IS NULL) + registros del tenant actual
CREATE POLICY "obras_sociales_select"
  ON public.obras_sociales
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  );

-- Seed inicial con obras sociales frecuentes en Mendoza y Argentina
INSERT INTO public.obras_sociales (entidad, plan_nombre, tenant_id) VALUES
  -- OSEP (Obra Social de Empleados Públicos de Mendoza)
  ('OSEP', 'Plan Básico', NULL),
  ('OSEP', 'Plan 100', NULL),
  ('OSEP', 'Plan 200', NULL),
  ('OSEP', 'Plan 300', NULL),
  ('OSEP', 'Plan AMB', NULL),

  -- PAMI
  ('PAMI', 'Plan PAMI', NULL),
  ('PAMI', 'Plan PAMI Módulo III', NULL),

  -- IOMA (aunque es provincial de Buenos Aires, frecuente en clínicas)
  ('IOMA', 'Plan Básico', NULL),
  ('IOMA', 'Plan Médico', NULL),

  -- OSPRERA (Obra Social de Personal Rural)
  ('OSPRERA', 'Plan Básico', NULL),

  -- Swiss Medical
  ('Swiss Medical', 'Plan SMC-01', NULL),
  ('Swiss Medical', 'Plan SMC-10', NULL),
  ('Swiss Medical', 'Plan SMC-20', NULL),

  -- Galeno
  ('Galeno', 'Plan Bronce', NULL),
  ('Galeno', 'Plan Plata', NULL),
  ('Galeno', 'Plan Oro', NULL),

  -- Medicus
  ('Medicus', 'Plan Básico', NULL),
  ('Medicus', 'Plan Plus', NULL),

  -- OSDE
  ('OSDE', 'Plan 210', NULL),
  ('OSDE', 'Plan 310', NULL),
  ('OSDE', 'Plan 410', NULL),
  ('OSDE', 'Plan 510', NULL),

  -- OSPAT (Obra Social del Personal de la Actividad Turística)
  ('OSPAT', 'Plan Básico', NULL),

  -- Particular (sin obra social)
  ('Particular', 'Sin cobertura', NULL)
ON CONFLICT DO NOTHING;
