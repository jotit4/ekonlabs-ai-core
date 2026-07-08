-- Migration 050 — Performance: RLS initplan wrapping + índices de FK sin cobertura
--
-- Contexto: los Supabase performance advisors reportaron políticas RLS con
-- `auth_rls_initplan` (reevalúan auth.uid()/auth.jwt()/auth.email() una vez POR FILA)
-- y varias foreign keys de negocio sin índice de cobertura.
--
-- Fix 1 (RLS): envolver cada auth.<fn>() en (select auth.<fn>()) para que Postgres
--   lo evalúe una sola vez por query (InitPlan) en lugar de por fila. Es la
--   optimización oficial recomendada por Supabase y NO cambia la semántica de la
--   política (mismo resultado de autorización). A la escala actual el impacto es
--   chico, pero elimina una penalización O(filas) que muerde al escalar.
--
-- Fix 2 (índices): crear índices en las FK que hoy provocan sequential scans al
--   filtrar/joinear (historial clínico por paciente, turnos por servicio, etc.).
--
-- Ambos fixes son NO destructivos e idempotentes.
-- Estado: YA aplicada en prod (2026-07-08). DB-only — el usuario la aplica en EasyPanel.

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 1 · RLS initplan wrapping (idempotente: des-envuelve y re-envuelve)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  r        record;
  new_qual text;
  new_chk  text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and ( qual ~ 'auth\.(uid|jwt|role|email)\(\)'
         or with_check ~ 'auth\.(uid|jwt|role|email)\(\)' )
  loop
    -- USING (...)
    new_qual := r.qual;
    if new_qual is not null then
      -- 1) desenvolver lo que ya esté envuelto (evita doble-wrap en re-runs)
      new_qual := regexp_replace(new_qual,
        '\(\s*select\s+(auth\.(uid|jwt|role|email)\(\))\s*\)', '\1', 'gi');
      -- 2) envolver todas las llamadas auth.<fn>()
      new_qual := regexp_replace(new_qual,
        'auth\.(uid|jwt|role|email)\(\)', '(select auth.\1())', 'g');
    end if;

    -- WITH CHECK (...)
    new_chk := r.with_check;
    if new_chk is not null then
      new_chk := regexp_replace(new_chk,
        '\(\s*select\s+(auth\.(uid|jwt|role|email)\(\))\s*\)', '\1', 'gi');
      new_chk := regexp_replace(new_chk,
        'auth\.(uid|jwt|role|email)\(\)', '(select auth.\1())', 'g');
    end if;

    execute format('alter policy %I on public.%I%s%s;',
      r.policyname, r.tablename,
      case when new_qual is not null then ' using (' || new_qual || ')' else '' end,
      case when new_chk  is not null then ' with check (' || new_chk || ')' else '' end
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 2 · Índices para FK sin cobertura (tablas de negocio)
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_appointments_service_id            on public.appointments (service_id);
create index if not exists idx_clinical_notes_author_id           on public.clinical_notes (author_id);
create index if not exists idx_clinical_notes_patient_id          on public.clinical_notes (patient_id);
create index if not exists idx_patient_documents_patient_id       on public.patient_documents (patient_id);
create index if not exists idx_patient_documents_uploaded_by      on public.patient_documents (uploaded_by);
create index if not exists idx_patients_primary_professional_id   on public.patients (primary_professional_id);
create index if not exists idx_session_notes_author_id            on public.session_notes (author_id);
create index if not exists idx_session_notes_patient_id           on public.session_notes (patient_id);
create index if not exists idx_session_notes_treatment_id         on public.session_notes (treatment_id);
create index if not exists idx_treatment_plans_author_id          on public.treatment_plans (author_id);
create index if not exists idx_treatment_plans_patient_id         on public.treatment_plans (patient_id);
create index if not exists idx_treatments_created_by              on public.treatments (created_by);
create index if not exists idx_treatments_patient_id              on public.treatments (patient_id);
create index if not exists idx_treatments_professional_id         on public.treatments (professional_id);
create index if not exists idx_treatments_service_id              on public.treatments (service_id);
