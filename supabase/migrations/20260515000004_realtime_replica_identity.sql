-- Migration: Set REPLICA IDENTITY FULL on tables used in Realtime subscriptions
-- Bug C-04 (part 1): appointments and thread_states are used in Realtime subscriptions
-- but lacked REPLICA IDENTITY FULL, so CDC events did not include old/new values
-- needed for correct tenant-scoped filtering.

ALTER TABLE public.appointments REPLICA IDENTITY FULL;
ALTER TABLE public.thread_states REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.thread_states;
