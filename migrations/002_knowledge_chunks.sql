-- Story 1.3 - Knowledge Base Ingestion (RAG / pgvector)
-- Requires: pgvector extension enabled on Supabase project
--           Run AFTER 001_initial_schema.sql (tenants table must exist)

create extension if not exists vector;

create table if not exists public.knowledge_chunks (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references public.tenants(tenant_id) on delete cascade,
    content         text not null,
    embedding       vector(1536) not null,
    source_filename text not null,
    chunk_index     int not null,
    created_at      timestamptz not null default timezone('utc', now())
);

-- Efficient tenant-level filtering (used in every WHERE clause)
create index if not exists idx_knowledge_chunks_tenant_id
    on public.knowledge_chunks (tenant_id);

-- IVFFlat index for cosine similarity search (<=> operator)
-- lists=100 is suitable for datasets up to ~1M vectors; tune upward as data grows
create index if not exists idx_knowledge_chunks_embedding
    on public.knowledge_chunks
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

-- Row Level Security — mirrors tenants table pattern
alter table public.knowledge_chunks enable row level security;

-- Authenticated clients can only read their own tenant's chunks
drop policy if exists knowledge_chunks_select_own on public.knowledge_chunks;
create policy knowledge_chunks_select_own
on public.knowledge_chunks
for select
to authenticated
using (
    tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', '')
);

-- Authenticated clients cannot insert/update/delete directly
-- (ingestion is done by the backend via service_role key, bypassing RLS)
drop policy if exists knowledge_chunks_insert_service_role_only on public.knowledge_chunks;
create policy knowledge_chunks_insert_service_role_only
on public.knowledge_chunks
for insert
to authenticated
with check (false);

drop policy if exists knowledge_chunks_update_service_role_only on public.knowledge_chunks;
create policy knowledge_chunks_update_service_role_only
on public.knowledge_chunks
for update
to authenticated
using (false);

drop policy if exists knowledge_chunks_delete_service_role_only on public.knowledge_chunks;
create policy knowledge_chunks_delete_service_role_only
on public.knowledge_chunks
for delete
to authenticated
using (false);

revoke all on table public.knowledge_chunks from anon;
