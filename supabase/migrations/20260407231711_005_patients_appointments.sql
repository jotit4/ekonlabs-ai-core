-- v1.4: Patient registration — patients table + appointments table
-- patients: persistent patient record scoped per tenant
CREATE TABLE IF NOT EXISTS public.patients (
  patient_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  phone_number       TEXT        NOT NULL CHECK (char_length(trim(phone_number)) >= 7),
  full_name          TEXT        NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  dni                TEXT        CHECK (dni ~ '^\d{7,8}$'),
  date_of_birth      DATE,
  email              TEXT,
  obra_social        TEXT,
  obra_social_number TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_patients_tenant ON patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patients_dni ON patients(tenant_id, dni) WHERE dni IS NOT NULL;

-- appointments: DB mirror of Google Calendar bookings for history queries
CREATE TABLE IF NOT EXISTS public.appointments (
  appointment_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  patient_id         UUID        NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  service_id         UUID        REFERENCES public.services(service_id) ON DELETE SET NULL,
  calendar_event_id  TEXT,
  start_at           TIMESTAMPTZ NOT NULL,
  end_at             TIMESTAMPTZ NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'confirmed'
                                 CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  booked_via         TEXT        NOT NULL DEFAULT 'whatsapp'
                                 CHECK (booked_via IN ('whatsapp','manual','web')),
  cancelled_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_status ON appointments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_event ON appointments(calendar_event_id) WHERE calendar_event_id IS NOT NULL;;
