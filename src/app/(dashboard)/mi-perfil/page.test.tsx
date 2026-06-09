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

vi.mock('@/components/mi-perfil/MiPerfilView', () => ({
  MiPerfilView: ({ role }: { role: string }) => (
    <div data-testid="mi-perfil-view">MiPerfilView:{role}</div>
  ),
}))

function makeJwt(role: string) {
  return Buffer.from(JSON.stringify({ app_role: role, tenant_id: 'tenant-1' })).toString('base64')
}

function setupRole(role: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockGetSession.mockResolvedValue({ data: { session: { access_token: makeJwt(role) } } })
  mockParseJwt.mockReturnValue({ app_role: role, tenant_id: 'tenant-1' })
}

import MiPerfilPage from './page'

describe('MiPerfilPage', () => {
  it('redirige a /login si no hay usuario', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(MiPerfilPage()).rejects.toThrow('REDIRECT:/login')
  })

  it('renderiza "Mi Perfil" y la vista para rol doctor (no redirige)', async () => {
    setupRole('doctor')
    const element = await MiPerfilPage()
    render(element)
    expect(screen.getByText('Mi Perfil')).toBeInTheDocument()
    expect(screen.getByTestId('mi-perfil-view')).toHaveTextContent('doctor')
  })

  it('renderiza "Mi Perfil" para rol admin (no redirige)', async () => {
    setupRole('admin')
    const element = await MiPerfilPage()
    render(element)
    expect(screen.getByText('Mi Perfil')).toBeInTheDocument()
    expect(screen.getByTestId('mi-perfil-view')).toHaveTextContent('admin')
  })

  it('renderiza "Mi Perfil" para rol receptionist (no redirige)', async () => {
    setupRole('receptionist')
    const element = await MiPerfilPage()
    render(element)
    expect(screen.getByText('Mi Perfil')).toBeInTheDocument()
    expect(screen.getByTestId('mi-perfil-view')).toHaveTextContent('receptionist')
  })
})
