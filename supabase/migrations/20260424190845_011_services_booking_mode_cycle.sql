ALTER TABLE public.services
    DROP CONSTRAINT IF EXISTS services_booking_mode_check;

ALTER TABLE public.services
    ADD CONSTRAINT services_booking_mode_check
    CHECK (booking_mode IN ('appointment', 'walk_in', 'gated', 'cycle'));

COMMENT ON COLUMN public.services.booking_mode IS
    'appointment = turno individual por calendario | walk_in = sin turno por orden de llegada | '
    'gated = requiere consulta/pedido médico previo | cycle = inscripción mensual/semanal al ciclo (sin turno individual)';;
