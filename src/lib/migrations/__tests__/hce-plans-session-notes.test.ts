// @vitest-environment node
// Tests de lint/verificación del schema SQL de las migraciones 040-042 (Story 14.1 — Epic 14 HCE).
// Verifica que los archivos de migration contienen las instrucciones SQL esperadas
// sin necesidad de una base de datos real (mismo patrón que Stories 9.1 / 9.2 / 13.1).
//
// Contrato AUTORITATIVO: _bmad-output/planning-artifacts/domain-tratamiento-clinico.md §3.4 / §3.5 / §3.6.

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

// Ruta base de las migrations (relativa al CWD = root del proyecto Next.js).
const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations')

function readMigration(filename: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, filename), 'utf-8')
}

const FILE_040 = '20260610000001_040_treatment_plans_table.sql'
const FILE_041 = '20260610000002_041_session_notes_table.sql'
const FILE_042 = '20260610000003_042_patients_clinical_fields.sql'

// ── Migration 040: CREATE TABLE treatment_plans ────────────────────────────────

describe('Migration 040 — tabla treatment_plans', () => {
  const sql = readMigration(FILE_040)

  it('crea la tabla treatment_plans con IF NOT EXISTS (idempotente)', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.treatment_plans/i)
  })

  it('tiene plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
    expect(sql).toMatch(/plan_id\s+uuid\s+PRIMARY KEY DEFAULT gen_random_uuid\(\)/i)
  })

  it('tiene tenant_id NOT NULL FK a tenants ON DELETE CASCADE', () => {
    expect(sql).toMatch(/tenant_id\s+uuid\s+NOT NULL REFERENCES public\.tenants\(tenant_id\) ON DELETE CASCADE/i)
  })

  it('tiene treatment_id NOT NULL FK a treatments ON DELETE CASCADE (1:1 lógico)', () => {
    expect(sql).toMatch(/treatment_id\s+uuid\s+NOT NULL REFERENCES public\.treatments\(treatment_id\) ON DELETE CASCADE/i)
  })

  it('tiene patient_id NOT NULL FK a patients ON DELETE CASCADE', () => {
    expect(sql).toMatch(/patient_id\s+uuid\s+NOT NULL REFERENCES public\.patients\(patient_id\) ON DELETE CASCADE/i)
  })

  it('tiene motivo_consulta, objetivo y discharge_report text (nullables)', () => {
    expect(sql).toMatch(/motivo_consulta\s+text\s*,/i)
    expect(sql).toMatch(/objetivo\s+text\s*,/i)
    expect(sql).toMatch(/discharge_report\s+text\s*,/i)
  })

  it('tiene cie10_code text SIN validación de formato en SQL (sin CHECK)', () => {
    expect(sql).toMatch(/cie10_code\s+text\s*,/i)
    expect(sql).not.toMatch(/cie10_code\s+text\s+[^,\n]*CHECK/i)
  })

  it('tiene indicated_sessions integer SIN CHECK (la validación de rango es Zod en 14.2)', () => {
    expect(sql).toMatch(/indicated_sessions\s+integer\s*,/i)
    expect(sql).not.toMatch(/indicated_sessions\s+integer\s+[^,\n]*CHECK/i)
  })

  it('tiene discharge_at timestamptz nullable (NULL = en curso)', () => {
    expect(sql).toMatch(/discharge_at\s+timestamptz\s*,/i)
    expect(sql).not.toMatch(/discharge_at\s+timestamptz\s+NOT NULL/i)
  })

  it('tiene author_id uuid FK a auth.users(id) nullable, sin ON DELETE explícito', () => {
    expect(sql).toMatch(/author_id\s+uuid\s+REFERENCES auth\.users\(id\)/i)
    expect(sql).not.toMatch(/author_id\s+uuid\s+NOT NULL/i)
    expect(sql).not.toMatch(/auth\.users\(id\)\s+ON DELETE/i)
  })

  it('tiene created_at y updated_at timestamptz NOT NULL DEFAULT now()', () => {
    expect(sql).toMatch(/created_at\s+timestamptz\s+NOT NULL DEFAULT now\(\)/i)
    expect(sql).toMatch(/updated_at\s+timestamptz\s+NOT NULL DEFAULT now\(\)/i)
  })

  it('NO agrega columnas fuera del contrato §3.4 (sin status/deleted_at)', () => {
    expect(sql).not.toMatch(/\bstatus\b\s+text/i)
    expect(sql).not.toMatch(/\bdeleted_at\b/i)
  })

  it('crea índice UNIQUE idx_treatment_plans_treatment sobre treatment_id (1:1, upsert 14.2)', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_treatment_plans_treatment/i)
    expect(sql).toMatch(/ON public\.treatment_plans \(treatment_id\)/i)
  })

  it('crea índice idx_treatment_plans_tenant_patient (tenant_id, patient_id)', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_treatment_plans_tenant_patient/i)
    expect(sql).toMatch(/ON public\.treatment_plans \(tenant_id, patient_id\)/i)
  })

  it('crea el trigger updated_at reusando set_updated_at_timestamp (con DROP previo)', () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_treatment_plans_updated_at ON public\.treatment_plans/i)
    expect(sql).toMatch(/CREATE TRIGGER trg_treatment_plans_updated_at/i)
    expect(sql).toMatch(/BEFORE UPDATE ON public\.treatment_plans/i)
    expect(sql).toMatch(/EXECUTE FUNCTION public\.set_updated_at_timestamp\(\)/i)
  })

  it('NO redefine la función set_updated_at_timestamp', () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.set_updated_at_timestamp/i)
  })
})

// ── Migration 040: RLS de treatment_plans (doctor/admin only) ──────────────────

describe('Migration 040 — RLS de treatment_plans (SOLO doctor/admin)', () => {
  const sql = readMigration(FILE_040)

  it('habilita ROW LEVEL SECURITY en treatment_plans', () => {
    expect(sql).toMatch(/ALTER TABLE public\.treatment_plans ENABLE ROW LEVEL SECURITY/i)
  })

  it('tiene policy SELECT con DROP previo, FOR SELECT TO authenticated', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "treatment_plans_select_own" ON public\.treatment_plans/i)
    expect(sql).toMatch(/CREATE POLICY "treatment_plans_select_own"[\s\S]*?FOR SELECT TO authenticated/i)
  })

  it('tiene policy INSERT con WITH CHECK', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "treatment_plans_insert_own" ON public\.treatment_plans/i)
    expect(sql).toMatch(/CREATE POLICY "treatment_plans_insert_own"[\s\S]*?FOR INSERT TO authenticated[\s\S]*?WITH CHECK/i)
  })

  it('tiene policy UPDATE con USING y WITH CHECK', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "treatment_plans_update_own" ON public\.treatment_plans/i)
    expect(sql).toMatch(/CREATE POLICY "treatment_plans_update_own"[\s\S]*?FOR UPDATE TO authenticated[\s\S]*?USING[\s\S]*?WITH CHECK/i)
  })

  it('tiene policy DELETE bloqueada con USING (false)', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "treatment_plans_delete_restricted" ON public\.treatment_plans/i)
    expect(sql).toMatch(/CREATE POLICY "treatment_plans_delete_restricted"[\s\S]*?FOR DELETE TO authenticated[\s\S]*?USING \(false\)/i)
  })

  it('usa coalesce(app_role, role) IN (doctor, admin) y tenant_id del JWT en SELECT/INSERT/UPDATE', () => {
    const tenantMatches = sql.match(/tenant_id::text = coalesce\(auth\.jwt\(\) ->> 'tenant_id', ''\)/g)
    expect(tenantMatches).not.toBeNull()
    expect(tenantMatches!.length).toBeGreaterThanOrEqual(3)
    const roleMatches = sql.match(/coalesce\(auth\.jwt\(\) ->> 'app_role', auth\.jwt\(\) ->> 'role'\) IN \('doctor','admin'\)/g)
    expect(roleMatches).not.toBeNull()
    expect(roleMatches!.length).toBeGreaterThanOrEqual(3)
  })

  it('NEGATIVO: las policies NO incluyen receptionist (Ley 25.326 — NO copiar 038)', () => {
    expect(sql).not.toMatch(/receptionist'/i)
    expect(sql).not.toMatch(/'receptionist/i)
  })

  it('NO agrega condiciones de author_id en las policies (decisión del epic)', () => {
    // author_id solo aparece como columna de la tabla, nunca dentro de USING/WITH CHECK.
    expect(sql).not.toMatch(/author_id\s*=\s*auth\.uid\(\)/i)
  })
})

// ── Migration 041: CREATE TABLE session_notes ──────────────────────────────────

describe('Migration 041 — tabla session_notes', () => {
  const sql = readMigration(FILE_041)

  it('crea la tabla session_notes con IF NOT EXISTS (idempotente)', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.session_notes/i)
  })

  it('tiene session_note_id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
    expect(sql).toMatch(/session_note_id\s+uuid\s+PRIMARY KEY DEFAULT gen_random_uuid\(\)/i)
  })

  it('tiene tenant_id NOT NULL FK a tenants ON DELETE CASCADE', () => {
    expect(sql).toMatch(/tenant_id\s+uuid\s+NOT NULL REFERENCES public\.tenants\(tenant_id\) ON DELETE CASCADE/i)
  })

  it('tiene appointment_id NOT NULL FK a appointments ON DELETE CASCADE', () => {
    expect(sql).toMatch(/appointment_id\s+uuid\s+NOT NULL REFERENCES public\.appointments\(appointment_id\) ON DELETE CASCADE/i)
  })

  it('tiene treatment_id NULLABLE FK a treatments sin cascada (turno suelto evoluciona — 14.3)', () => {
    expect(sql).toMatch(/treatment_id\s+uuid\s+REFERENCES public\.treatments\(treatment_id\)/i)
    expect(sql).not.toMatch(/treatment_id\s+uuid\s+NOT NULL/i)
    expect(sql).not.toMatch(/treatments\(treatment_id\)\s+ON DELETE/i)
  })

  it('tiene patient_id NOT NULL FK a patients ON DELETE CASCADE', () => {
    expect(sql).toMatch(/patient_id\s+uuid\s+NOT NULL REFERENCES public\.patients\(patient_id\) ON DELETE CASCADE/i)
  })

  it('tiene worked_on y progress text (nullables)', () => {
    expect(sql).toMatch(/worked_on\s+text\s*,/i)
    expect(sql).toMatch(/progress\s+text\s*,/i)
  })

  it('tiene author_id uuid FK a auth.users(id) nullable', () => {
    expect(sql).toMatch(/author_id\s+uuid\s+REFERENCES auth\.users\(id\)/i)
    expect(sql).not.toMatch(/author_id\s+uuid\s+NOT NULL/i)
  })

  it('tiene created_at y updated_at timestamptz NOT NULL DEFAULT now()', () => {
    expect(sql).toMatch(/created_at\s+timestamptz\s+NOT NULL DEFAULT now\(\)/i)
    expect(sql).toMatch(/updated_at\s+timestamptz\s+NOT NULL DEFAULT now\(\)/i)
  })

  it('NO agrega columnas fuera del contrato §3.5 (sin status/deleted_at/content)', () => {
    expect(sql).not.toMatch(/\bstatus\b\s+text/i)
    expect(sql).not.toMatch(/\bdeleted_at\b/i)
    expect(sql).not.toMatch(/\bcontent\b\s+text/i)
  })

  it('crea índice UNIQUE idx_session_notes_appointment sobre appointment_id (1 evolución por turno)', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_session_notes_appointment/i)
    expect(sql).toMatch(/ON public\.session_notes \(appointment_id\)/i)
  })

  it('crea índice idx_session_notes_tenant_treatment (tenant_id, treatment_id)', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_session_notes_tenant_treatment/i)
    expect(sql).toMatch(/ON public\.session_notes \(tenant_id, treatment_id\)/i)
  })

  it('crea el trigger updated_at reusando set_updated_at_timestamp (con DROP previo)', () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_session_notes_updated_at ON public\.session_notes/i)
    expect(sql).toMatch(/CREATE TRIGGER trg_session_notes_updated_at/i)
    expect(sql).toMatch(/BEFORE UPDATE ON public\.session_notes/i)
    expect(sql).toMatch(/EXECUTE FUNCTION public\.set_updated_at_timestamp\(\)/i)
  })

  it('NO redefine la función set_updated_at_timestamp', () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.set_updated_at_timestamp/i)
  })
})

// ── Migration 041: RLS de session_notes (doctor/admin only) ────────────────────

describe('Migration 041 — RLS de session_notes (SOLO doctor/admin)', () => {
  const sql = readMigration(FILE_041)

  it('habilita ROW LEVEL SECURITY en session_notes', () => {
    expect(sql).toMatch(/ALTER TABLE public\.session_notes ENABLE ROW LEVEL SECURITY/i)
  })

  it('tiene policy SELECT con DROP previo, FOR SELECT TO authenticated', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "session_notes_select_own" ON public\.session_notes/i)
    expect(sql).toMatch(/CREATE POLICY "session_notes_select_own"[\s\S]*?FOR SELECT TO authenticated/i)
  })

  it('tiene policy INSERT con WITH CHECK', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "session_notes_insert_own" ON public\.session_notes/i)
    expect(sql).toMatch(/CREATE POLICY "session_notes_insert_own"[\s\S]*?FOR INSERT TO authenticated[\s\S]*?WITH CHECK/i)
  })

  it('tiene policy UPDATE con USING y WITH CHECK', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "session_notes_update_own" ON public\.session_notes/i)
    expect(sql).toMatch(/CREATE POLICY "session_notes_update_own"[\s\S]*?FOR UPDATE TO authenticated[\s\S]*?USING[\s\S]*?WITH CHECK/i)
  })

  it('tiene policy DELETE bloqueada con USING (false)', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "session_notes_delete_restricted" ON public\.session_notes/i)
    expect(sql).toMatch(/CREATE POLICY "session_notes_delete_restricted"[\s\S]*?FOR DELETE TO authenticated[\s\S]*?USING \(false\)/i)
  })

  it('usa coalesce(app_role, role) IN (doctor, admin) y tenant_id del JWT en SELECT/INSERT/UPDATE', () => {
    const tenantMatches = sql.match(/tenant_id::text = coalesce\(auth\.jwt\(\) ->> 'tenant_id', ''\)/g)
    expect(tenantMatches).not.toBeNull()
    expect(tenantMatches!.length).toBeGreaterThanOrEqual(3)
    const roleMatches = sql.match(/coalesce\(auth\.jwt\(\) ->> 'app_role', auth\.jwt\(\) ->> 'role'\) IN \('doctor','admin'\)/g)
    expect(roleMatches).not.toBeNull()
    expect(roleMatches!.length).toBeGreaterThanOrEqual(3)
  })

  it('NEGATIVO: las policies NO incluyen receptionist (Ley 25.326 — NO copiar 038)', () => {
    expect(sql).not.toMatch(/receptionist'/i)
    expect(sql).not.toMatch(/'receptionist/i)
  })

  it('NO agrega condiciones de author_id en las policies (decisión del epic)', () => {
    expect(sql).not.toMatch(/author_id\s*=\s*auth\.uid\(\)/i)
  })
})

// ── Migration 042: campos clínicos en patients (aditiva) ───────────────────────

describe('Migration 042 — campos clínicos en patients', () => {
  const sql = readMigration(FILE_042)

  it('hace ALTER TABLE public.patients', () => {
    expect(sql).toMatch(/ALTER TABLE public\.patients/i)
  })

  it('agrega antecedentes text con ADD COLUMN IF NOT EXISTS', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS antecedentes\s+text/i)
  })

  it('agrega alergias text con ADD COLUMN IF NOT EXISTS', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS alergias\s+text/i)
  })

  it('agrega medicacion text con ADD COLUMN IF NOT EXISTS', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS medicacion\s+text/i)
  })

  it('las 3 columnas son nullables: sin NOT NULL, sin DEFAULT, sin CHECK', () => {
    expect(sql).not.toMatch(/NOT NULL/i)
    expect(sql).not.toMatch(/DEFAULT/i)
    expect(sql).not.toMatch(/CHECK/i)
  })

  it('es puramente aditiva: NO toca RLS, policies, constraints ni columnas existentes', () => {
    expect(sql).not.toMatch(/CREATE POLICY/i)
    expect(sql).not.toMatch(/DROP POLICY/i)
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i)
    expect(sql).not.toMatch(/DROP COLUMN/i)
    expect(sql).not.toMatch(/ALTER COLUMN/i)
    expect(sql).not.toMatch(/ADD CONSTRAINT/i)
    expect(sql).not.toMatch(/CREATE TABLE/i)
  })

  it('documenta las columnas con COMMENT ON COLUMN (patrón 013)', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN public\.patients\.antecedentes/i)
    expect(sql).toMatch(/COMMENT ON COLUMN public\.patients\.alergias/i)
    expect(sql).toMatch(/COMMENT ON COLUMN public\.patients\.medicacion/i)
  })
})

// ── Validación transversal — Story 14.1 ────────────────────────────────────────

describe('Story 14.1 — validación de archivos, orden y contratos transversales', () => {
  const migrations = [FILE_040, FILE_041, FILE_042]

  it('los 3 archivos de migration existen con contenido', () => {
    for (const filename of migrations) {
      const sql = readMigration(filename)
      expect(sql.length).toBeGreaterThan(0)
    }
  })

  it('los timestamps son posteriores a la última migration existente (039 = 20260609000004)', () => {
    for (const filename of migrations) {
      const timestamp = Number(filename.split('_')[0])
      expect(timestamp).toBeGreaterThan(20260609000004)
    }
  })

  it('los números de secuencia son 040, 041, 042 contiguos (NO reusan la 039 descartada)', () => {
    const seqs = migrations.map((f) => Number(f.split('_')[1]))
    expect(seqs).toEqual([40, 41, 42])
  })

  it('los timestamps son ascendentes (orden estricto de aplicación)', () => {
    const timestamps = migrations.map((f) => Number(f.split('_')[0]))
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1])
    }
  })

  it('NEGATIVO: ningún archivo menciona clinical_notes (la tabla queda intacta)', () => {
    for (const filename of migrations) {
      expect(readMigration(filename)).not.toMatch(/clinical_notes/i)
    }
  })

  it('NEGATIVO: ningún archivo crea tabla de adjuntos/estudios (eso reusa patient_documents — 14.5)', () => {
    for (const filename of migrations) {
      const sql = readMigration(filename)
      expect(sql).not.toMatch(/CREATE TABLE[\s\S]*?(attachments|estudios|patient_documents)/i)
    }
  })

  it('NEGATIVO: ningún archivo contiene DDL destructivo (DROP TABLE / DROP COLUMN / TRUNCATE)', () => {
    for (const filename of migrations) {
      const sql = readMigration(filename)
      expect(sql).not.toMatch(/DROP TABLE/i)
      expect(sql).not.toMatch(/DROP COLUMN/i)
      expect(sql).not.toMatch(/TRUNCATE/i)
    }
  })
})
