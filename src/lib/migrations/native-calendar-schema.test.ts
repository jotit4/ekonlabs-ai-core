// @vitest-environment node
// Tests de lint/verificación del schema SQL para el módulo de calendario nativo (Story 9.1)
// Verifica que los archivos de migration contienen las instrucciones SQL esperadas
// sin necesidad de una base de datos real.

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

// Ruta base de las migrations (relativa al CWD = root del proyecto Next.js)
// Vitest corre desde el directorio raíz del proyecto, por lo que process.cwd()
// apunta a ekonlabs-dashboard/ en todos los entornos.
const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations')

function readMigration(filename: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, filename), 'utf-8')
}

// ── Migration 014: professionals ──────────────────────────────────────────────

describe('Migration 014 — tabla professionals', () => {
  const sql = readMigration('20260516000001_014_professionals.sql')

  it('crea la tabla professionals con IF NOT EXISTS', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.professionals/i)
  })

  it('tiene columna professional_id UUID PRIMARY KEY', () => {
    expect(sql).toMatch(/professional_id\s+UUID\s+PRIMARY KEY/i)
  })

  it('tiene columna tenant_id con FK a tenants', () => {
    expect(sql).toMatch(/tenant_id\s+UUID\s+NOT NULL\s+REFERENCES public\.tenants\(tenant_id\)/i)
  })

  it('tiene columna name TEXT NOT NULL', () => {
    expect(sql).toMatch(/name\s+TEXT\s+NOT NULL/i)
  })

  it('tiene columna email TEXT NOT NULL', () => {
    expect(sql).toMatch(/email\s+TEXT\s+NOT NULL/i)
  })

  it('tiene columna active BOOLEAN NOT NULL DEFAULT TRUE', () => {
    expect(sql).toMatch(/active\s+BOOLEAN\s+NOT NULL\s+DEFAULT TRUE/i)
  })

  it('tiene UNIQUE INDEX en email (globalmente único)', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS professionals_email_unique/i)
    expect(sql).toMatch(/ON public\.professionals\(email\)/i)
  })

  it('tiene índice en tenant_id y active', () => {
    expect(sql).toMatch(/idx_professionals_tenant/i)
    expect(sql).toMatch(/ON public\.professionals\(tenant_id,\s*active\)/i)
  })

  it('habilita RLS', () => {
    expect(sql).toMatch(/ALTER TABLE public\.professionals ENABLE ROW LEVEL SECURITY/i)
  })

  it('tiene política SELECT para tenant isolation con DROP IF EXISTS previo', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS professionals_select_own ON public\.professionals/i)
    expect(sql).toMatch(/CREATE POLICY professionals_select_own/i)
    expect(sql).toMatch(/ON public\.professionals FOR SELECT TO authenticated/i)
    expect(sql).toMatch(/tenant_id::text = coalesce\(auth\.jwt\(\) ->> 'tenant_id', ''\)/i)
  })

  it('revoca acceso a anon', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.professionals FROM anon/i)
  })
})

// ── Migration 015: service_professionals ──────────────────────────────────────

describe('Migration 015 — tabla service_professionals', () => {
  const sql = readMigration('20260516000002_015_service_professionals.sql')

  it('crea la tabla service_professionals con IF NOT EXISTS', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.service_professionals/i)
  })

  it('tiene columna service_id con FK a services', () => {
    expect(sql).toMatch(/service_id\s+UUID\s+NOT NULL\s+REFERENCES public\.services\(service_id\)/i)
  })

  it('tiene columna professional_id con FK a professionals', () => {
    expect(sql).toMatch(/professional_id\s+UUID\s+NOT NULL\s+REFERENCES public\.professionals\(professional_id\)/i)
  })

  it('tiene PRIMARY KEY compuesta (service_id, professional_id)', () => {
    expect(sql).toMatch(/PRIMARY KEY \(service_id,\s*professional_id\)/i)
  })

  it('tiene índice en professional_id', () => {
    expect(sql).toMatch(/idx_sp_professional/i)
    expect(sql).toMatch(/ON public\.service_professionals\(professional_id\)/i)
  })

  it('habilita RLS', () => {
    expect(sql).toMatch(/ALTER TABLE public\.service_professionals ENABLE ROW LEVEL SECURITY/i)
  })

  it('tiene política SELECT via JOIN a professionals (sin tenant_id directo)', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS service_professionals_select_own ON public\.service_professionals/i)
    expect(sql).toMatch(/CREATE POLICY service_professionals_select_own/i)
    expect(sql).toMatch(/EXISTS\s*\(/i)
    expect(sql).toMatch(/FROM public\.professionals p/i)
    expect(sql).toMatch(/p\.tenant_id::text = coalesce\(auth\.jwt\(\) ->> 'tenant_id', ''\)/i)
  })

  it('revoca acceso a anon', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.service_professionals FROM anon/i)
  })
})

// ── Migration 016: professional_schedules ─────────────────────────────────────

describe('Migration 016 — tabla professional_schedules', () => {
  const sql = readMigration('20260516000003_016_professional_schedules.sql')

  it('crea la tabla professional_schedules con IF NOT EXISTS', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.professional_schedules/i)
  })

  it('tiene columna schedule_id UUID PRIMARY KEY', () => {
    expect(sql).toMatch(/schedule_id\s+UUID\s+PRIMARY KEY/i)
  })

  it('tiene columna professional_id con FK a professionals', () => {
    expect(sql).toMatch(/professional_id\s+UUID\s+NOT NULL\s+REFERENCES public\.professionals\(professional_id\)/i)
  })

  it('tiene columna day_of_week SMALLINT con CHECK 0-6', () => {
    expect(sql).toMatch(/day_of_week\s+SMALLINT\s+NOT NULL\s+CHECK \(day_of_week BETWEEN 0 AND 6\)/i)
  })

  it('tiene columnas start_time y end_time TIME', () => {
    expect(sql).toMatch(/start_time\s+TIME\s+NOT NULL/i)
    expect(sql).toMatch(/end_time\s+TIME\s+NOT NULL/i)
  })

  it('tiene CONSTRAINT check_schedule_end_after_start', () => {
    expect(sql).toMatch(/check_schedule_end_after_start/i)
    expect(sql).toMatch(/end_time > start_time/i)
  })

  it('tiene UNIQUE constraint para soporte de ON CONFLICT en seed', () => {
    expect(sql).toMatch(/professional_schedules_unique_slot/i)
    expect(sql).toMatch(/UNIQUE \(professional_id,\s*day_of_week,\s*start_time\)/i)
  })

  it('tiene índice en professional_id', () => {
    expect(sql).toMatch(/idx_professional_schedules_professional/i)
    expect(sql).toMatch(/ON public\.professional_schedules\(professional_id\)/i)
  })

  it('habilita RLS', () => {
    expect(sql).toMatch(/ALTER TABLE public\.professional_schedules ENABLE ROW LEVEL SECURITY/i)
  })

  it('tiene política SELECT via JOIN a professionals', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS professional_schedules_select_own ON public\.professional_schedules/i)
    expect(sql).toMatch(/CREATE POLICY professional_schedules_select_own/i)
    expect(sql).toMatch(/EXISTS\s*\(/i)
    expect(sql).toMatch(/FROM public\.professionals p/i)
  })

  it('revoca acceso a anon', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.professional_schedules FROM anon/i)
  })
})

// ── Migration 017: blocked_times ─────────────────────────────────────────────

describe('Migration 017 — tabla blocked_times', () => {
  const sql = readMigration('20260516000004_017_blocked_times.sql')

  it('crea la tabla blocked_times con IF NOT EXISTS', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.blocked_times/i)
  })

  it('tiene columna block_id UUID PRIMARY KEY', () => {
    expect(sql).toMatch(/block_id\s+UUID\s+PRIMARY KEY/i)
  })

  it('tiene columna professional_id con FK a professionals', () => {
    expect(sql).toMatch(/professional_id\s+UUID\s+NOT NULL\s+REFERENCES public\.professionals\(professional_id\)/i)
  })

  it('tiene columnas date_from y date_to DATE NOT NULL', () => {
    expect(sql).toMatch(/date_from\s+DATE\s+NOT NULL/i)
    expect(sql).toMatch(/date_to\s+DATE\s+NOT NULL/i)
  })

  it('tiene CONSTRAINT check_blocked_date_order', () => {
    expect(sql).toMatch(/check_blocked_date_order/i)
    expect(sql).toMatch(/date_from <= date_to/i)
  })

  it('tiene índice compuesto en professional_id, date_from, date_to', () => {
    expect(sql).toMatch(/idx_blocked_times_professional/i)
    expect(sql).toMatch(/ON public\.blocked_times\(professional_id,\s*date_from,\s*date_to\)/i)
  })

  it('habilita RLS', () => {
    expect(sql).toMatch(/ALTER TABLE public\.blocked_times ENABLE ROW LEVEL SECURITY/i)
  })

  it('tiene política SELECT via JOIN a professionals', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS blocked_times_select_own ON public\.blocked_times/i)
    expect(sql).toMatch(/CREATE POLICY blocked_times_select_own/i)
    expect(sql).toMatch(/EXISTS\s*\(/i)
    expect(sql).toMatch(/FROM public\.professionals p/i)
  })

  it('revoca acceso a anon', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.blocked_times FROM anon/i)
  })
})

// ── Migration 018: patients y appointments — FK a professionals ───────────────

describe('Migration 018 — FK patients y appointments a professionals', () => {
  const sql = readMigration('20260516000005_018_patient_appointment_professional_fkeys.sql')

  it('agrega columna preferred_professional_id a patients con ADD COLUMN IF NOT EXISTS', () => {
    expect(sql).toMatch(/ALTER TABLE public\.patients/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS preferred_professional_id\s+UUID/i)
    expect(sql).toMatch(/REFERENCES public\.professionals\(professional_id\).*ON DELETE SET NULL/i)
  })

  it('crea índice parcial en patients.preferred_professional_id', () => {
    expect(sql).toMatch(/idx_patients_preferred_professional/i)
    expect(sql).toMatch(/ON public\.patients\(preferred_professional_id\)/i)
    expect(sql).toMatch(/WHERE preferred_professional_id IS NOT NULL/i)
  })

  it('agrega columna professional_id a appointments con ADD COLUMN IF NOT EXISTS', () => {
    expect(sql).toMatch(/ALTER TABLE public\.appointments/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS professional_id\s+UUID/i)
    expect(sql).toMatch(/REFERENCES public\.professionals\(professional_id\).*ON DELETE SET NULL/i)
  })

  it('crea índice parcial en appointments.professional_id', () => {
    expect(sql).toMatch(/idx_appointments_professional/i)
    expect(sql).toMatch(/ON public\.appointments\(professional_id\)/i)
    expect(sql).toMatch(/WHERE professional_id IS NOT NULL/i)
  })
})

// ── Migration 019: tenants.uses_native_calendar ───────────────────────────────

describe('Migration 019 — tenants.uses_native_calendar', () => {
  const sql = readMigration('20260516000006_019_tenants_uses_native_calendar.sql')

  it('agrega columna uses_native_calendar a tenants con ADD COLUMN IF NOT EXISTS', () => {
    expect(sql).toMatch(/ALTER TABLE public\.tenants/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS uses_native_calendar\s+BOOLEAN\s+NOT NULL\s+DEFAULT FALSE/i)
  })

  it('tiene COMMENT ON COLUMN explicando el propósito', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN public\.tenants\.uses_native_calendar/i)
    expect(sql).toMatch(/availability_service\.py/i)
    expect(sql).toMatch(/calendar_service\.py/i)
  })
})

// ── Migration 020: seed ISADI — profesionales y horarios ─────────────────────

describe('Migration 020 — seed ISADI profesionales y horarios', () => {
  const sql = readMigration('20260516000007_020_seed_isadi_professionals.sql')

  it('usa un bloque DO $$ ... $$ para lógica procesal', () => {
    expect(sql).toMatch(/DO \$\$/i)
    expect(sql).toMatch(/END \$\$/i)
  })

  it('referencia el tenant ISADI correcto', () => {
    expect(sql).toContain('5298fcc5-15bf-494c-9655-b49d759cfef4')
  })

  it('inserta a Patricia Pérez Bernal', () => {
    expect(sql).toMatch(/Patricia Pérez Bernal/u)
    expect(sql).toContain('patricia@isadi.com.ar')
  })

  it('inserta a Aldo Luque', () => {
    expect(sql).toMatch(/Aldo Luque/u)
    expect(sql).toContain('aldo@isadi.com.ar')
  })

  it('usa ON CONFLICT (email) DO NOTHING para idempotencia en professionals', () => {
    expect(sql).toMatch(/ON CONFLICT \(email\) DO NOTHING/i)
  })

  it('vincula a los servicios Kinesiología, Fisioterapia y Rehabilitación física', () => {
    expect(sql).toMatch(/Kinesiología/u)
    expect(sql).toMatch(/Fisioterapia/u)
    expect(sql).toMatch(/Rehabilitación física/u)
  })

  it('inserta horarios de Lun-Vie (generate_series 0-4)', () => {
    expect(sql).toMatch(/generate_series\(0,\s*4\)/i)
  })

  it('usa 08:00 y 18:00 como horarios', () => {
    expect(sql).toContain('08:00')
    expect(sql).toContain('18:00')
  })

  it('usa ON CONFLICT con professional_schedules_unique_slot para idempotencia', () => {
    expect(sql).toMatch(/ON CONFLICT \(professional_id,\s*day_of_week,\s*start_time\) DO NOTHING/i)
  })
})

// ── Validación de orden de timestamps ─────────────────────────────────────────

describe('Orden y timestamps de las 7 migrations de Epic 9', () => {
  const migrations = [
    '20260516000001_014_professionals.sql',
    '20260516000002_015_service_professionals.sql',
    '20260516000003_016_professional_schedules.sql',
    '20260516000004_017_blocked_times.sql',
    '20260516000005_018_patient_appointment_professional_fkeys.sql',
    '20260516000006_019_tenants_uses_native_calendar.sql',
    '20260516000007_020_seed_isadi_professionals.sql',
  ]

  it('todos los archivos de migration existen', () => {
    for (const filename of migrations) {
      const sql = readMigration(filename)
      expect(sql.length).toBeGreaterThan(0)
    }
  })

  it('los timestamps son posteriores a la última migration existente (20260515*)', () => {
    for (const filename of migrations) {
      const timestamp = filename.split('_')[0]
      expect(Number(timestamp)).toBeGreaterThan(20260515999999)
    }
  })

  it('los timestamps son ascendentes (orden correcto de aplicación)', () => {
    const timestamps = migrations.map((f) => Number(f.split('_')[0]))
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1])
    }
  })
})
