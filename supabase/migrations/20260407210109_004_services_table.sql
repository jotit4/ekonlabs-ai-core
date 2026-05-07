CREATE TABLE IF NOT EXISTS services (
  service_id        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID        NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  calendar_id       TEXT        NOT NULL,
  professional_name TEXT,
  duration_minutes  INT         DEFAULT 60,
  active            BOOLEAN     DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_services_tenant_active ON services(tenant_id, active);;
