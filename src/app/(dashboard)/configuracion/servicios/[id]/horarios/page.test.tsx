import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockGetUser, mockGetSession, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
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
      auth: { getUser: mockGetUser, getSession: mockGetSession },
      from: mockFrom,
    })
  ),
}))

vi.mock('@/components/configuracion/ServiceHoursView', () => ({
  ServiceHoursView: ({ serviceId, serviceName }: { serviceId: string; serviceName: string }) => (
    <div data-testid="service-hours-view" data-service-id={serviceId} data-service-name={serviceName} />
  ),
}))

import ServiceHorariosPage from './page'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown> = { app_role: 'admin', tenant_id: 'tenant-1' }) {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `h.${encoded}.sig`
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function setupAdminWithService(serviceId: string, serviceName: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: makeJwt({ app_role: 'admin', tenant_id: 'tenant-1' }),
      },
    },
  })
  // Mock chain: .from('services').select('service_id, name').eq('service_id', id).single()
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { service_id: serviceId, name: serviceName },
      error: null,
    }),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ServiceHorariosPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('redirige a /login si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    await expect(ServiceHorariosPage(makeParams('svc-1'))).rejects.toThrow('REDIRECT:/login')
  })

  it('redirige a /agenda si el rol no es admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'receptionist', tenant_id: 'tenant-1' }),
        },
      },
    })

    await expect(ServiceHorariosPage(makeParams('svc-1'))).rejects.toThrow('REDIRECT:/agenda')
  })

  it('redirige a /configuracion/servicios si el servicio no existe en el tenant', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'admin', tenant_id: 'tenant-1' }),
        },
      },
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    })

    await expect(ServiceHorariosPage(makeParams('svc-999'))).rejects.toThrow(
      'REDIRECT:/configuracion/servicios'
    )
  })

  it('renderiza ServiceHoursView con serviceId y serviceName correctos', async () => {
    setupAdminWithService('svc-1', 'Cardiología')

    const element = await ServiceHorariosPage(makeParams('svc-1'))
    render(element)

    const view = screen.getByTestId('service-hours-view')
    expect(view).toBeInTheDocument()
    expect(view.getAttribute('data-service-id')).toBe('svc-1')
    expect(view.getAttribute('data-service-name')).toBe('Cardiología')

    // Header
    expect(screen.getByText('Cardiología — Horarios')).toBeInTheDocument()
    expect(screen.getByText('Configuración / Servicios')).toBeInTheDocument()
  })
})
