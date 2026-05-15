// @vitest-environment node
// Tests de lint/verificación de las migrations de escritura RLS del calendario nativo (Story 9.2)
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

// ── Migration 021: professionals — policies de escritura ──────────────────────

describe('Migration 021 — professionals write policies', () => {
  const sql = readMigration('20260516000008_021_professionals_rls_write.sql')

  it('el archivo existe y tiene contenido', () => {
    expect(sql.length).toBeGreaterThan(0)
  })

  it('tiene policy INSERT para admin', () => {
    expect(sql).toContain('professionals_insert_admin')
    expect(sql).toContain('FOR INSERT')
    expect(sql).toContain("'admin'")
  })

  it('tiene DROP POLICY IF EXISTS antes del CREATE POLICY INSERT', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS professionals_insert_admin ON public\.professionals/i)
  })

  it('INSERT usa WITH CHECK con tenant_id y role = admin', () => {
    expect(sql).toMatch(/professionals_insert_admin[\s\S]*?WITH CHECK[\s\S]*?tenant_id::text[\s\S]*?'admin'/i)
  })

  it('tiene policy UPDATE para admin', () => {
    expect(sql).toContain('professionals_update_admin')
    expect(sql).toContain('FOR UPDATE')
  })

  it('UPDATE tiene USING y WITH CHECK', () => {
    expect(sql).toMatch(/professionals_update_admin[\s\S]*?USING[\s\S]*?WITH CHECK/i)
  })

  it('tiene policy DELETE para admin', () => {
    expect(sql).toContain('professionals_delete_admin')
    expect(sql).toContain('FOR DELETE')
  })

  it('DELETE usa USING con tenant_id y role = admin', () => {
    expect(sql).toMatch(/professionals_delete_admin[\s\S]*?USING[\s\S]*?tenant_id::text[\s\S]*?'admin'/i)
  })

  it('NO recrea la policy SELECT (ya existe en Story 9.1)', () => {
    expect(sql).not.toContain('FOR SELECT')
  })

  it('todas las policies son TO authenticated', () => {
    const matches = sql.match(/TO authenticated/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(3)
  })
})

// ── Migration 022: service_professionals — policies de escritura ───────────────

describe('Migration 022 — service_professionals write policies', () => {
  const sql = readMigration('20260516000009_022_service_professionals_rls_write.sql')

  it('el archivo existe y tiene contenido', () => {
    expect(sql.length).toBeGreaterThan(0)
  })

  it('tiene policy INSERT para admin', () => {
    expect(sql).toContain('service_professionals_insert_admin')
    expect(sql).toContain('FOR INSERT')
  })

  it('tiene DROP POLICY IF EXISTS antes del CREATE POLICY INSERT', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS service_professionals_insert_admin ON public\.service_professionals/i)
  })

  it('INSERT usa JOIN a professionals para validar tenant', () => {
    expect(sql).toMatch(/service_professionals_insert_admin[\s\S]*?public\.professionals/i)
  })

  it('tiene policy UPDATE para admin', () => {
    expect(sql).toContain('service_professionals_update_admin')
    expect(sql).toContain('FOR UPDATE')
  })

  it('tiene policy DELETE para admin', () => {
    expect(sql).toContain('service_professionals_delete_admin')
    expect(sql).toContain('FOR DELETE')
  })

  it('usa EXISTS con JOIN a public.professionals para tenant isolation', () => {
    expect(sql).toMatch(/EXISTS\s*\(/i)
    expect(sql).toMatch(/FROM public\.professionals/i)
    expect(sql).toMatch(/p\.tenant_id::text = coalesce\(auth\.jwt\(\) ->> 'tenant_id', ''\)/i)
  })

  it('NO recrea la policy SELECT', () => {
    expect(sql).not.toContain('FOR SELECT')
  })
})

// ── Migration 023: professional_schedules — policies de escritura ─────────────

describe('Migration 023 — professional_schedules write policies', () => {
  const sql = readMigration('20260516000010_023_professional_schedules_rls_write.sql')

  it('el archivo existe y tiene contenido', () => {
    expect(sql.length).toBeGreaterThan(0)
  })

  it('tiene policy INSERT con condición own_or_admin', () => {
    expect(sql).toContain('professional_schedules_insert_own_or_admin')
    expect(sql).toContain('FOR INSERT')
  })

  it('tiene DROP POLICY IF EXISTS antes del CREATE POLICY INSERT', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS professional_schedules_insert_own_or_admin ON public\.professional_schedules/i)
  })

  it('tiene policy UPDATE con condición own_or_admin', () => {
    expect(sql).toContain('professional_schedules_update_own_or_admin')
    expect(sql).toContain('FOR UPDATE')
  })

  it('UPDATE tiene USING y WITH CHECK', () => {
    expect(sql).toMatch(/professional_schedules_update_own_or_admin[\s\S]*?USING[\s\S]*?WITH CHECK/i)
  })

  it('tiene policy DELETE con condición own_or_admin', () => {
    expect(sql).toContain('professional_schedules_delete_own_or_admin')
    expect(sql).toContain('FOR DELETE')
  })

  it('incluye verificación de email del profesional (auth.email o jwt email)', () => {
    expect(sql).toMatch(/auth\.email\(\)|auth\.jwt\(\)\s*->>\s*'email'/)
  })

  it('la condición de email usa p.email match con el usuario autenticado', () => {
    expect(sql).toMatch(/p\.email\s*=\s*coalesce\(auth\.jwt\(\)\s*->>\s*'email',\s*auth\.email\(\)\)/i)
  })

  it('usa EXISTS con JOIN a public.professionals para tenant isolation', () => {
    expect(sql).toMatch(/EXISTS\s*\(/i)
    expect(sql).toMatch(/FROM public\.professionals/i)
  })

  it('NO recrea la policy SELECT', () => {
    expect(sql).not.toContain('FOR SELECT')
  })
})

// ── Migration 024: blocked_times — policies de escritura ──────────────────────

describe('Migration 024 — blocked_times write policies', () => {
  const sql = readMigration('20260516000011_024_blocked_times_rls_write.sql')

  it('el archivo existe y tiene contenido', () => {
    expect(sql.length).toBeGreaterThan(0)
  })

  it('tiene policy INSERT con condición own_or_admin', () => {
    expect(sql).toContain('blocked_times_insert_own_or_admin')
    expect(sql).toContain('FOR INSERT')
  })

  it('tiene DROP POLICY IF EXISTS antes del CREATE POLICY INSERT', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS blocked_times_insert_own_or_admin ON public\.blocked_times/i)
  })

  it('tiene policy UPDATE con condición own_or_admin', () => {
    expect(sql).toContain('blocked_times_update_own_or_admin')
    expect(sql).toContain('FOR UPDATE')
  })

  it('UPDATE tiene USING y WITH CHECK', () => {
    expect(sql).toMatch(/blocked_times_update_own_or_admin[\s\S]*?USING[\s\S]*?WITH CHECK/i)
  })

  it('tiene policy DELETE con condición own_or_admin', () => {
    expect(sql).toContain('blocked_times_delete_own_or_admin')
    expect(sql).toContain('FOR DELETE')
  })

  it('incluye verificación de email del profesional (auth.email o jwt email)', () => {
    expect(sql).toMatch(/auth\.email\(\)|auth\.jwt\(\)\s*->>\s*'email'/)
  })

  it('la condición de email usa p.email match con el usuario autenticado', () => {
    expect(sql).toMatch(/p\.email\s*=\s*coalesce\(auth\.jwt\(\)\s*->>\s*'email',\s*auth\.email\(\)\)/i)
  })

  it('usa EXISTS con JOIN a public.professionals para tenant isolation', () => {
    expect(sql).toMatch(/EXISTS\s*\(/i)
    expect(sql).toMatch(/FROM public\.professionals/i)
  })

  it('NO recrea la policy SELECT', () => {
    expect(sql).not.toContain('FOR SELECT')
  })
})

// ── Validación de archivos y timestamps de Story 9.2 ─────────────────────────

describe('Story 9.2 — validación de archivos y orden de timestamps', () => {
  const migrations = [
    '20260516000008_021_professionals_rls_write.sql',
    '20260516000009_022_service_professionals_rls_write.sql',
    '20260516000010_023_professional_schedules_rls_write.sql',
    '20260516000011_024_blocked_times_rls_write.sql',
  ]

  it('los 4 archivos de migration existen con los nombres exactos esperados', () => {
    for (const filename of migrations) {
      const sql = readMigration(filename)
      expect(sql.length).toBeGreaterThan(0)
    }
  })

  it('los timestamps son posteriores a los de Story 9.1 (20260516000007)', () => {
    for (const filename of migrations) {
      const timestamp = Number(filename.split('_')[0])
      expect(timestamp).toBeGreaterThan(20260516000007)
    }
  })

  it('los timestamps son ascendentes (orden correcto de aplicación)', () => {
    const timestamps = migrations.map((f) => Number(f.split('_')[0]))
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1])
    }
  })

  it('ninguna migration de Story 9.2 recrea una policy SELECT', () => {
    for (const filename of migrations) {
      const sql = readMigration(filename)
      expect(sql).not.toContain('FOR SELECT')
    }
  })
})
