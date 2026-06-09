// @vitest-environment node
// Tests de lint/verificación del schema SQL de las migraciones 036-039 (Story 13.1 — Epic 13).
// Verifica que los archivos de migration contienen las instrucciones SQL esperadas
// sin necesidad de una base de datos real (mismo patrón que Stories 9.1 / 9.2).
//
// Contrato AUTORITATIVO: _bmad-output/planning-artifacts/domain-tratamiento-clinico.md §3 / §4.

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

// Ruta base de las migrations (relativa al CWD = root del proyecto Next.js).
const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations')

function readMigration(filename: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, filename), 'utf-8')
}

const FILE_036 = '20260609000001_036_treatments_table.sql'
const FILE_037 = '20260609000002_037_appointments_package_id.sql'
const FILE_038 = '20260609000003_038_treatments_rls.sql'
const FILE_039 = '20260609000004_039_tenants_absence_policy_backfill.sql'

// ── Migration 036: CREATE TABLE treatments ─────────────────────────────────────

describe('Migration 036 — tabla treatments', () => {
  const sql = readMigration(FILE_036)

  it('crea la tabla treatments con IF NOT EXISTS (idempotente)', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.treatments/i)
  })

  it('tiene treatment_id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
    expect(sql).toMatch(/treatment_id\s+uuid\s+PRIMARY KEY DEFAULT gen_random_uuid\(\)/i)
  })

  it('tiene tenant_id NOT NULL FK a tenants ON DELETE CASCADE', () => {
    expect(sql).toMatch(/tenant_id\s+uuid\s+NOT NULL REFERENCES public\.tenants\(tenant_id\) ON DELETE CASCADE/i)
  })

  it('tiene patient_id NOT NULL FK a patients ON DELETE CASCADE', () => {
    expect(sql).toMatch(/patient_id\s+uuid\s+NOT NULL REFERENCES public\.patients\(patient_id\) ON DELETE CASCADE/i)
  })

  it('tiene service_id NOT NULL FK a services (sin ON DELETE explícito)', () => {
    expect(sql).toMatch(/service_id\s+uuid\s+NOT NULL REFERENCES public\.services\(service_id\)/i)
  })

  it('tiene professional_id FK a professionals (nullable — profesional principal)', () => {
    expect(sql).toMatch(/professional_id\s+uuid\s+REFERENCES public\.professionals\(professional_id\)/i)
  })

  it('tiene total_sessions integer NOT NULL CHECK (> 0)', () => {
    expect(sql).toMatch(/total_sessions\s+integer\s+NOT NULL CHECK \(total_sessions > 0\)/i)
  })

  it('tiene sessions_remaining integer NOT NULL CHECK (>= 0)', () => {
    expect(sql).toMatch(/sessions_remaining\s+integer\s+NOT NULL CHECK \(sessions_remaining >= 0\)/i)
  })

  it('tiene start_date date NOT NULL', () => {
    expect(sql).toMatch(/start_date\s+date\s+NOT NULL/i)
  })

  it('tiene pattern jsonb NOT NULL', () => {
    expect(sql).toMatch(/pattern\s+jsonb\s+NOT NULL/i)
  })

  it('tiene status text NOT NULL DEFAULT active con CHECK de los 4 valores', () => {
    expect(sql).toMatch(/status\s+text\s+NOT NULL DEFAULT 'active'/i)
    expect(sql).toMatch(/CHECK \(status IN \('active','completed','cancelled','expired'\)\)/i)
  })

  it('tiene expires_at date (nullable)', () => {
    expect(sql).toMatch(/expires_at\s+date/i)
  })

  it('tiene created_by uuid FK a auth.users(id)', () => {
    expect(sql).toMatch(/created_by\s+uuid\s+REFERENCES auth\.users\(id\)/i)
  })

  it('tiene created_at y updated_at timestamptz NOT NULL DEFAULT now()', () => {
    expect(sql).toMatch(/created_at\s+timestamptz\s+NOT NULL DEFAULT now\(\)/i)
    expect(sql).toMatch(/updated_at\s+timestamptz\s+NOT NULL DEFAULT now\(\)/i)
  })

  it('NO agrega columnas fuera del contrato §3.1 (sin notes/price)', () => {
    expect(sql).not.toMatch(/\bnotes\b/i)
    expect(sql).not.toMatch(/\bprice\b/i)
  })

  it('crea índice idx_treatments_tenant_patient (tenant_id, patient_id)', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_treatments_tenant_patient/i)
    expect(sql).toMatch(/ON public\.treatments \(tenant_id, patient_id\)/i)
  })

  it('crea índice idx_treatments_tenant_status (tenant_id, status)', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_treatments_tenant_status/i)
    expect(sql).toMatch(/ON public\.treatments \(tenant_id, status\)/i)
  })

  it('crea el trigger updated_at reusando set_updated_at_timestamp (con DROP previo)', () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_treatments_updated_at ON public\.treatments/i)
    expect(sql).toMatch(/CREATE TRIGGER trg_treatments_updated_at/i)
    expect(sql).toMatch(/BEFORE UPDATE ON public\.treatments/i)
    expect(sql).toMatch(/EXECUTE FUNCTION public\.set_updated_at_timestamp\(\)/i)
  })

  it('NO redefine la función set_updated_at_timestamp', () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.set_updated_at_timestamp/i)
  })
})

// ── Migration 037: appointments.package_id + session_index ─────────────────────

describe('Migration 037 — appointments.package_id + session_index', () => {
  const sql = readMigration(FILE_037)

  it('agrega package_id uuid FK a treatments ON DELETE SET NULL con ADD COLUMN IF NOT EXISTS', () => {
    expect(sql).toMatch(/ALTER TABLE public\.appointments/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public\.treatments\(treatment_id\) ON DELETE SET NULL/i)
  })

  it('agrega session_index integer con ADD COLUMN IF NOT EXISTS', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS session_index integer/i)
  })

  it('crea índice parcial idx_appointments_package WHERE package_id IS NOT NULL', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_appointments_package/i)
    expect(sql).toMatch(/ON public\.appointments \(package_id\) WHERE package_id IS NOT NULL/i)
  })

  it('es puramente aditiva — NO toca el candado 029 ni el CHECK de status', () => {
    // El nombre del índice 029 puede aparecer en comentarios (documenta que NO se toca);
    // lo que NO debe existir es una operación DDL destructiva sobre él o sobre columnas.
    expect(sql).not.toMatch(/DROP\s+INDEX[\s\S]*?idx_appointments_no_overlap_professional/i)
    expect(sql).not.toMatch(/DROP COLUMN/i)
    expect(sql).not.toMatch(/ADD CONSTRAINT[\s\S]*?status/i)
    expect(sql).not.toMatch(/status\s+IN\s*\(/i)
  })
})

// ── Migration 038: RLS de treatments ───────────────────────────────────────────

describe('Migration 038 — RLS de treatments', () => {
  const sql = readMigration(FILE_038)

  it('habilita ROW LEVEL SECURITY en treatments', () => {
    expect(sql).toMatch(/ALTER TABLE public\.treatments ENABLE ROW LEVEL SECURITY/i)
  })

  it('tiene policy SELECT con DROP previo, tenant + coalesce(app_role, role)', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "treatments_select_own" ON public\.treatments/i)
    expect(sql).toMatch(/CREATE POLICY "treatments_select_own"[\s\S]*?FOR SELECT TO authenticated/i)
  })

  it('tiene policy INSERT con WITH CHECK', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "treatments_insert_own" ON public\.treatments/i)
    expect(sql).toMatch(/CREATE POLICY "treatments_insert_own"[\s\S]*?FOR INSERT TO authenticated[\s\S]*?WITH CHECK/i)
  })

  it('tiene policy UPDATE con USING y WITH CHECK (treatments es mutable)', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "treatments_update_own" ON public\.treatments/i)
    expect(sql).toMatch(/CREATE POLICY "treatments_update_own"[\s\S]*?FOR UPDATE TO authenticated[\s\S]*?USING[\s\S]*?WITH CHECK/i)
  })

  it('tiene policy DELETE bloqueada con USING (false)', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "treatments_delete_restricted" ON public\.treatments/i)
    expect(sql).toMatch(/CREATE POLICY "treatments_delete_restricted"[\s\S]*?FOR DELETE TO authenticated[\s\S]*?USING \(false\)/i)
  })

  it('usa coalesce(app_role, role) y tenant_id del JWT en SELECT/INSERT/UPDATE', () => {
    const tenantMatches = sql.match(/tenant_id::text = coalesce\(auth\.jwt\(\) ->> 'tenant_id', ''\)/g)
    expect(tenantMatches).not.toBeNull()
    expect(tenantMatches!.length).toBeGreaterThanOrEqual(3)
    const roleMatches = sql.match(/coalesce\(auth\.jwt\(\) ->> 'app_role', auth\.jwt\(\) ->> 'role'\) IN \('receptionist','doctor','admin'\)/g)
    expect(roleMatches).not.toBeNull()
    expect(roleMatches!.length).toBeGreaterThanOrEqual(3)
  })
})

// ── Migration 039: backfill absence_policy ─────────────────────────────────────

describe('Migration 039 — backfill tenants.rules.absence_policy', () => {
  const sql = readMigration(FILE_039)

  it('hace UPDATE sobre public.tenants', () => {
    expect(sql).toMatch(/UPDATE public\.tenants/i)
  })

  it('usa merge jsonb || (NO reemplaza todo rules)', () => {
    expect(sql).toMatch(/SET rules = rules \|\| jsonb_build_object/i)
  })

  it('escribe la clave absence_policy con los defaults ISADI', () => {
    expect(sql).toMatch(/'absence_policy'/)
    expect(sql).toMatch(/'notice_window_hours',\s*24/)
    expect(sql).toMatch(/'allow_recovery_on_notice',\s*true/)
    expect(sql).toMatch(/'no_show_consequence',\s*'lose'/)
  })

  it('es idempotente: WHERE NOT (rules ? \'absence_policy\')', () => {
    expect(sql).toMatch(/WHERE NOT \(rules \? 'absence_policy'\)/i)
  })

  it('NO crea tabla ni columna nueva', () => {
    expect(sql).not.toMatch(/CREATE TABLE/i)
    expect(sql).not.toMatch(/ADD COLUMN/i)
  })
})

// ── Validación de archivos y orden de timestamps (Story 13.1) ─────────────────

describe('Story 13.1 — validación de archivos y orden de timestamps', () => {
  const migrations = [FILE_036, FILE_037, FILE_038, FILE_039]

  it('los 4 archivos de migration existen con contenido', () => {
    for (const filename of migrations) {
      const sql = readMigration(filename)
      expect(sql.length).toBeGreaterThan(0)
    }
  })

  it('los timestamps son posteriores a la última migration existente (035 = 20260605000002)', () => {
    for (const filename of migrations) {
      const timestamp = Number(filename.split('_')[0])
      expect(timestamp).toBeGreaterThan(20260605000002)
    }
  })

  it('los números de secuencia son 036, 037, 038, 039 contiguos', () => {
    const seqs = migrations.map((f) => Number(f.split('_')[1]))
    expect(seqs).toEqual([36, 37, 38, 39])
  })

  it('los timestamps son ascendentes (orden estricto de aplicación)', () => {
    const timestamps = migrations.map((f) => Number(f.split('_')[0]))
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1])
    }
  })
})
