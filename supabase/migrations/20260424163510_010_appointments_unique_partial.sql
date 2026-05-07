CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_no_overlap
  ON public.appointments (tenant_id, service_id, start_at)
  WHERE status IN ('confirmed', 'pending_calendar');

COMMENT ON INDEX idx_appointments_no_overlap IS
  'F4: prevents double-booking for same (tenant, service, slot). ON CONFLICT DO NOTHING in booking service detects races.';;
