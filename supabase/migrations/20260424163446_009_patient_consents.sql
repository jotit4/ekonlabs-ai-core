CREATE TABLE IF NOT EXISTS public.patient_consents (
  id            UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  phone_hash    TEXT        NOT NULL,
  tenant_id     UUID        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  consent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ,
  version       TEXT        NOT NULL DEFAULT '1.0',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_consents_phone_tenant
  ON public.patient_consents (phone_hash, tenant_id);

CREATE INDEX IF NOT EXISTS idx_patient_consents_tenant
  ON public.patient_consents (tenant_id);

COMMENT ON TABLE public.patient_consents IS
  'Opt-in consent records (Ley 25.326 Art. 13-20). phone_hash = hash_pii(phone). revoked_at IS NULL = active consent.';;
