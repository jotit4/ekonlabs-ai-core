-- Migration: Set REPLICA IDENTITY FULL on conversations table
-- Bug C-04 (part 2): conversations is used in Realtime subscriptions with tenant_id filter.
-- REPLICA IDENTITY FULL is required so CDC events include old/new values,
-- enabling correct server-side tenant-scoped filtering for UPDATE and DELETE events.

ALTER TABLE public.conversations REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
