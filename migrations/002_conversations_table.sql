-- Story 2.2 - Conversation History
-- Tabla de historial de mensajes por paciente/tenant con RLS.
-- NFR4 (Ley 25.326): Los registros deben purgarse a los 30 días vía job programado (deuda técnica).

create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(tenant_id) on delete cascade,
    phone_number text not null check (char_length(trim(phone_number)) >= 7),
    role text not null check (role in ('user', 'assistant', 'system')),
    content text not null check (char_length(trim(content)) >= 1),
    created_at timestamptz not null default timezone('utc', now())
);

-- Índice compuesto para queries de historial ordenado por tiempo
-- Soporta: .eq("tenant_id", ...).eq("phone_number", ...).order("created_at", desc=True).limit(n)
create index if not exists idx_conversations_tenant_phone_time
on public.conversations (tenant_id, phone_number, created_at desc);

comment on table public.conversations is
'Historial de mensajes por paciente/tenant. Purgar registros > 30 días (NFR4 / Ley Argentina 25.326).';

-- Row Level Security
alter table public.conversations enable row level security;

-- Service Role (backend admin path) bypassa RLS en Supabase por diseño.
-- Estas políticas protegen a clientes authenticated/anon de acceso cross-tenant.

drop policy if exists conversations_select_own on public.conversations;
create policy conversations_select_own
on public.conversations
for select
to authenticated
using (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
);

drop policy if exists conversations_insert_service_role_only on public.conversations;
create policy conversations_insert_service_role_only
on public.conversations
for insert
to authenticated
with check (false);

drop policy if exists conversations_update_own on public.conversations;
create policy conversations_update_own
on public.conversations
for update
to authenticated
using (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
)
with check (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
);

drop policy if exists conversations_delete_own on public.conversations;
create policy conversations_delete_own
on public.conversations
for delete
to authenticated
using (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
);

revoke all on table public.conversations from anon;
