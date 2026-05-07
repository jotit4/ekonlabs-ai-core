-- Migration 006: Extensiones de servicios y citas para reglas de booking por servicio

ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS booking_mode TEXT NOT NULL DEFAULT 'appointment',
    ADD COLUMN IF NOT EXISTS prerequisite_note TEXT,
    ADD COLUMN IF NOT EXISTS capacity_per_slot INTEGER,
    ADD COLUMN IF NOT EXISTS requires_prescription BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_referral_only BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reminder_hours_before INTEGER,
    ADD COLUMN IF NOT EXISTS reminder_instructions TEXT;

ALTER TABLE public.services
    DROP CONSTRAINT IF EXISTS services_booking_mode_check;

ALTER TABLE public.services
    ADD CONSTRAINT services_booking_mode_check
    CHECK (booking_mode IN ('appointment', 'walk_in', 'gated'));

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attendance_confirmed BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_appointments_reminder
    ON public.appointments(tenant_id, start_at)
    WHERE reminder_sent_at IS NULL AND status = 'confirmed';;
