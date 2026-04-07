-- Migration 004: tabla services para soporte multi-servicio / multi-profesional (v1.3)
--
-- Cada servicio tiene su propio calendar_id. Las calendar_credentials se reutilizan
-- desde el tenant (un solo service account Google por tenant).
--
-- Backwards compatible: tenants sin registros en esta tabla siguen usando tenants.calendar_id.

CREATE TABLE IF NOT EXISTS services (
  service_id        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID        NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  calendar_id       TEXT        NOT NULL,
  professional_name TEXT,                     -- nombre del profesional (para título del evento)
  duration_minutes  INT         DEFAULT 60,   -- duración del turno; override de DEFAULT_SLOT_DURATION_MINUTES
  active            BOOLEAN     DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_services_tenant_active ON services(tenant_id, active);
