import { vi, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockGetSession = vi.hoisted(() => vi.fn())
const mockParseJwt = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
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

import AgendaPage from './page'

describe('AgendaPage (guard de rol)', () => {
  it('redirige a /login si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    await expect(AgendaPage()).rejects.toThrow('REDIRECT:/login')
  })

  it('redirige a /agenda/mi-agenda si el rol es doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('doctor') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    await expect(AgendaPage()).rejects.toThrow('REDIRECT:/agenda/mi-agenda')
  })

  it('renderiza la agenda global cuando el rol es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('admin') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })

    const element = await AgendaPage()
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

    const element = await AgendaPage()
    render(element)

    const view = screen.getByTestId('agenda-view')
    expect(view).toBeInTheDocument()
    // FIX A: recepción arranca en modo turnero desde el primer frame gracias a initialRole.
    expect(view).toHaveAttribute('data-initial-role', 'receptionist')
  })
})
