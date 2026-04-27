-- F3: Add audit columns to appointments for cancellation tracking
-- cancelled_by and cancellation_reason enable structured audit without a separate table.
-- cancelled_at already existed (005_patients_appointments.sql).
BEGIN;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT
    CHECK (cancelled_by IN ('patient', 'staff', 'system')),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMIT;
