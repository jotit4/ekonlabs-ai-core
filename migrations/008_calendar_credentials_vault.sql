-- F0.1: Move Google Calendar service-account credentials out of JSONB plaintext.
-- Adds calendar_credentials_ref TEXT to tenants for Vault / env-var secret names.
-- calendar_credentials JSONB is kept but deprecated; drain to NULL after all
-- tenants have been migrated to calendar_credentials_ref.

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS calendar_credentials_ref TEXT;

COMMENT ON COLUMN public.tenants.calendar_credentials_ref IS
  'Name of a Supabase Vault secret or env var that holds the Google service account JSON. Prefer over calendar_credentials JSONB.';

COMMENT ON COLUMN public.tenants.calendar_credentials IS
  'DEPRECATED (F0.1): plaintext service account JSON. Drain to NULL once calendar_credentials_ref is set for all tenants.';

COMMIT;
