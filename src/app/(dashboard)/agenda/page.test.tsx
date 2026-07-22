import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockGetSession = vi.hoisted(() => vi.fn())
const mockParseJwt = vi.hoisted(() => vi.fn())
const mockSingle = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
    // Cadena mínima para la lectura de dashboard_users (atajo "ver mi día"):
    // .from('dashboard_users').select('professional_id').eq('user_id', id).single()
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
}))

vi.mock('./AgendaView', () => ({
  AgendaView: ({ initialRole }: { initialRole?: string | null }) => (
    <div data-testid="agenda-view" data-initial-role={initialRole ?? ''}>AgendaView</div>
  ),
}))

function makeJwt(role: string) {
  return Buffer.from(JSON.stringify({ app_role: role, tenant_id: 'tenant-1' })).toString('base64')
}

// Helper: props de la page. searchParams es una Promise en Next.js 16.
function props(searchParams: Record<string, string | string[] | undefined> = {}) {
  return { searchParams: Promise.resolve(searchParams) }
}

import AgendaPage from './page'

describe('AgendaPage (guard de rol)', () => {
  beforeEach(() => {
    // Default: sin profesional ni subtipo (no dispara el atajo "ver mi día").
    mockSingle.mockResolvedValue({ data: { professional_id: null, attention_mode: null } })
  })

  it('redirige a /login si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    await expect(AgendaPage(props())).rejects.toThrow('REDIRECT:/login')
  })

  it('redirige a /agenda/mi-agenda si el rol es doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('doctor') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    await expect(AgendaPage(props())).rejects.toThrow('REDIRECT:/agenda/mi-agenda')
  })

  it('renderiza la agenda global cuando el rol es admin (sin profesional vinculado)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('admin') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })

    const element = await AgendaPage(props())
    render(element)

    const view = screen.getByTestId('agenda-view')
    expect(view).toBeInTheDocument()
    // FIX A: el rol del server se pasa como initialRole (sin parpadeo en cliente).
    expect(view).toHaveAttribute('data-initial-role', 'admin')
  })

  it('renderiza la agenda global cuando el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('receptionist') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    const element = await AgendaPage(props())
    render(element)

    const view = screen.getByTestId('agenda-view')
    expect(view).toBeInTheDocument()
    // FIX A: recepción arranca en modo turnero desde el primer frame gracias a initialRole.
    expect(view).toHaveAttribute('data-initial-role', 'receptionist')
  })

  // Atajo "ver mi día" (ISADI 2026-07-17, regeneralizado por el subtipo de la
  // migración 056): lo decide attention_mode = 'walk_in', no el rol.
  it('un Doctor-fila (walk_in) que entra "en frío" es redirigido a su día', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('admin') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    mockSingle.mockResolvedValue({
      data: { professional_id: 'prof-1', attention_mode: 'walk_in' },
    })

    await expect(AgendaPage(props())).rejects.toThrow(
      'REDIRECT:/agenda?vista=dia&professional_id=prof-1',
    )
  })

  it('un Doctor-fila NO es redirigido si ya hay query params (respeta su navegación)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('admin') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    mockSingle.mockResolvedValue({
      data: { professional_id: 'prof-1', attention_mode: 'walk_in' },
    })

    const element = await AgendaPage(props({ vista: 'semana' }))
    render(element)

    expect(screen.getByTestId('agenda-view')).toBeInTheDocument()
  })

  // Un admin que atiende POR TURNOS abre la agenda global completa: antes del
  // subtipo, cualquier admin vinculado quedaba desviado a su propia columna.
  it('un admin vinculado pero de tipo "turno" NO es desviado: ve la agenda completa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('admin') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    mockSingle.mockResolvedValue({
      data: { professional_id: 'prof-1', attention_mode: 'appointment' },
    })

    const element = await AgendaPage(props())
    render(element)

    expect(screen.getByTestId('agenda-view')).toBeInTheDocument()
  })

  it('una recepcionista marcada walk_in por error NO rompe: sin profesional no hay desvío', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('receptionist') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })
    mockSingle.mockResolvedValue({
      data: { professional_id: null, attention_mode: 'walk_in' },
    })

    const element = await AgendaPage(props())
    render(element)

    expect(screen.getByTestId('agenda-view')).toBeInTheDocument()
  })
})
