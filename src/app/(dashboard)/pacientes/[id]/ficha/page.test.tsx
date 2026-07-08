import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { FichaDossier } from '@/types/ficha'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockGetUser, mockGetFichaDossier } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetFichaDossier: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn().mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    }),
  ),
}))

vi.mock('@/lib/pacientes/ficha-dossier', () => ({
  getFichaDossier: mockGetFichaDossier,
}))

vi.mock('@/components/pacientes/FichaImprimibleView', () => ({
  FichaImprimibleView: ({ dossier }: { dossier: FichaDossier }) => (
    <div data-testid="ficha-view" data-patient-name={dossier.patient.full_name} />
  ),
}))

import FichaPacientePage from './page'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeDossier(overrides: Partial<FichaDossier> = {}): FichaDossier {
  return {
    patient: {
      patient_id: 'patient-1',
      full_name: 'Ana López',
      dni: '30123456',
      date_of_birth: '1990-05-15',
      phone_number: '+5491133334444',
      address: null,
      obra_social: null,
      obra_social_number: null,
      reason_for_visit: null,
      notes: null,
      antecedentes: null,
      medicacion: null,
      cirugias: null,
      lugar: null,
      ocupacion: null,
      derivacion: null,
      actividad_fisica: null,
      primary_professional_name: null,
    },
    tratamientoObjetivo: null,
    treatments: [],
    evolucion: [],
    limitations: {
      clinicalFieldsUnavailable: false,
      treatmentPlansUnavailable: false,
      sessionNotesUnavailable: false,
    },
    ...overrides,
  }
}

describe('FichaPacientePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirige a /login si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    await expect(FichaPacientePage(makeParams('patient-1'))).rejects.toThrow('REDIRECT:/login')
  })

  it('redirige a /pacientes si el paciente no existe (o no es visible por RLS)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetFichaDossier.mockResolvedValue(null)

    await expect(FichaPacientePage(makeParams('patient-x'))).rejects.toThrow('REDIRECT:/pacientes')
  })

  it('renderiza FichaImprimibleView con el dossier del paciente', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetFichaDossier.mockResolvedValue(makeDossier())

    const element = await FichaPacientePage(makeParams('patient-1'))
    render(element)

    const view = screen.getByTestId('ficha-view')
    expect(view).toBeInTheDocument()
    expect(view.getAttribute('data-patient-name')).toBe('Ana López')
    expect(mockGetFichaDossier).toHaveBeenCalledWith(expect.anything(), 'patient-1')
  })
})
