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

vi.mock('@/components/mi-disponibilidad/MiDisponibilidadView', () => ({
  MiDisponibilidadView: () => <div data-testid="mi-disponibilidad-view">MiDisponibilidadView</div>,
}))

function makeJwt(role: string) {
  return Buffer.from(JSON.stringify({ app_role: role, tenant_id: 'tenant-1' })).toString('base64')
}

import MiDisponibilidadPage from './page'

describe('MiDisponibilidadPage', () => {
  it('redirige a /login si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    await expect(MiDisponibilidadPage()).rejects.toThrow('REDIRECT:/login')
  })

  it('redirige a /agenda si el rol es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('admin') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })

    await expect(MiDisponibilidadPage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it('redirige a /agenda si el rol es receptionist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('receptionist') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    await expect(MiDisponibilidadPage()).rejects.toThrow('REDIRECT:/agenda')
  })

  it('renderiza el título "Mi Disponibilidad" cuando el rol es doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('doctor') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const element = await MiDisponibilidadPage()
    render(element)

    expect(screen.getByText('Mi Disponibilidad')).toBeInTheDocument()
    expect(screen.getByTestId('mi-disponibilidad-view')).toBeInTheDocument()
  })
})
