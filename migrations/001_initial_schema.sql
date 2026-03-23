-- Story 1.2 - Tenant Creation
-- Supabase / PostgreSQL baseline schema for multi-tenant onboarding.

create extension if not exists pgcrypto;

create table if not exists public.tenants (
    tenant_id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(trim(name)) >= 2),
    whatsapp_number text not null unique check (whatsapp_number ~ '^\+?[0-9]{8,20}$'),
    timezone text not null default 'America/Argentina/Buenos_Aires',
    shadow_mode_enabled boolean not null default false,
    status text not null default 'active' check (status in ('active', 'inactive')),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_tenants_status on public.tenants (status);
create index if not exists idx_tenants_created_at on public.tenants (created_at desc);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists trg_tenants_updated_at on public.tenants;
create trigger trg_tenants_updated_at
before update on public.tenants
for each row
execute function public.set_updated_at_timestamp();

-- Row Level Security (RLS) baseline.
alter table public.tenants enable row level security;

-- Service Role (backend admin path) bypasses RLS in Supabase by design.
-- These policies protect authenticated/anon clients from cross-tenant access.

drop policy if exists tenants_select_own on public.tenants;
create policy tenants_select_own
on public.tenants
for select
to authenticated
using (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
);

drop policy if exists tenants_update_own on public.tenants;
create policy tenants_update_own
on public.tenants
for update
to authenticated
using (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
)
with check (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
);

drop policy if exists tenants_delete_own on public.tenants;
create policy tenants_delete_own
on public.tenants
for delete
to authenticated
using (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
);

drop policy if exists tenants_insert_service_role_only on public.tenants;
create policy tenants_insert_service_role_only
on public.tenants
for insert
to authenticated
with check (false);

revoke all on table public.tenants from anon;
