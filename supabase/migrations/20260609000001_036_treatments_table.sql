-- Migration 036: Tabla raíz `treatments` (Epic 13 — Paquetes de sesiones / Tratamiento clínico)
-- Esquema AUTORITATIVO: _bmad-output/planning-artifacts/domain-tratamiento-clinico.md §3.1 / §3.2.
--
-- Un TRATAMIENTO unifica el concepto de "paquete" (término de recepción) y "tratamiento"
-- (término clínico). Una sola tabla raíz, no dos. Cuelgan de ella el agendamiento (Epic 13,
-- via appointments.package_id — migración 037) y la HCE (Epic 14).
--
-- DB-only. Esta migración NO se aplica automáticamente: el usuario la aplica en EasyPanel.
-- Idempotente (IF NOT EXISTS) para poder re-correrla sin error.
--
-- Reuso: la función public.set_updated_at_timestamp() YA existe (bootstrap_core L17-25).
-- NO se redefine — solo se crea el trigger que la invoca.

-- ─── Tabla ──────────────────────────────────────────────────────────────────
-- Columnas = contrato cerrado de domain-tratamiento-clinico.md §3.1. NO agregar/renombrar.

CREATE TABLE IF NOT EXISTS public.treatments (
  treatment_id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  patient_id          uuid        NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  service_id          uuid        NOT NULL REFERENCES public.services(service_id),
  professional_id     uuid        REFERENCES public.professionals(professional_id),
  total_sessions      integer     NOT NULL CHECK (total_sessions > 0),
  sessions_remaining  integer     NOT NULL CHECK (sessions_remaining >= 0),
  start_date          date        NOT NULL,
  pattern             jsonb       NOT NULL,
  status              text        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','completed','cancelled','expired')),
  expires_at          date,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- `pattern` (jsonb NOT NULL) guarda el patrón de slots semanales (§3.2):
--   { "slots": [ { "day_of_week": 2, "time": "10:00", "professional_id": "<uuid>" }, ... ] }
-- day_of_week: 0=lunes … 6=domingo (misma convención ISODOW-1 que professional_schedules / 029).
-- Esta migración NO valida la forma del pattern — la validación Zod es de la Story 13.2.

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_treatments_tenant_patient
  ON public.treatments (tenant_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_treatments_tenant_status
  ON public.treatments (tenant_id, status);

-- ─── Trigger updated_at (reusa la función existente) ──────────────────────────

DROP TRIGGER IF EXISTS trg_treatments_updated_at ON public.treatments;
CREATE TRIGGER trg_treatments_updated_at
BEFORE UPDATE ON public.treatments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();
