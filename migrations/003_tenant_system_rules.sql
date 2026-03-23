-- Story 1.4 - Tenant System Rules (Configuración de Comportamiento)
-- Agrega columnas para system_prompt_override y rules a la tabla tenants.

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS system_prompt_override TEXT DEFAULT NULL;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '{}';

-- Índice GIN para búsquedas parciales en JSONB (ej. filtrar por tono o idioma)
CREATE INDEX IF NOT EXISTS idx_tenants_rules
    ON public.tenants USING gin (rules);
