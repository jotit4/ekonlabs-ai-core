ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT
    CHECK (cancelled_by IN ('patient', 'staff', 'system')),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;;
