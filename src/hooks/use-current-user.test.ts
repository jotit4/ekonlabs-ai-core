import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useCurrentUser } from './use-current-user'

function makeJwt(payload: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `header.${encoded}.signature`
}

const mockSignOut = vi.fn().mockResolvedValue({})
const mockSingle = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockGetSession = vi.fn()

const mockSupabase = {
  auth: {
    getSession: mockGetSession,
    signOut: mockSignOut,
  },
  from: () => ({
    select: mockSelect.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    single: mockSingle,
  }),
}

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => mockSupabase,
}))

function renderCurrentUser(sharedClient?: QueryClient) {
  const client = sharedClient ?? new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderHook(() => useCurrentUser(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  })
}

describe('useCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna isLoading=true inicialmente', () => {
    mockGetSession.mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderCurrentUser()
    expect(result.current.isLoading).toBe(true)
    expect(result.current.user).toBeNull()
  })

  it('retorna user con fullName, email, role, initials cuando sesión y SELECT son válidos', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'admin', tenant_id: 'uuid-1' }),
          user: { id: 'user-id-1', email: 'fallback@example.com' },
        },
      },
    })
    mockSingle.mockResolvedValue({
      data: { full_name: 'Patricia Pérez', email: 'patricia@isadi.com' },
      error: null,
    })

    const { result } = renderCurrentUser()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user).not.toBeNull()
    expect(result.current.user?.fullName).toBe('Patricia Pérez')
    expect(result.current.user?.email).toBe('patricia@isadi.com')
    expect(result.current.user?.role).toBe('admin')
    expect(result.current.user?.initials).toBe('PP')
  })

  it('calcula initials correctamente — "Patricia Pérez" → "PP"', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'doctor', tenant_id: 'uuid-1' }),
          user: { id: 'user-id-2', email: 'yamileth@test.com' },
        },
      },
    })
    mockSingle.mockResolvedValue({
      data: { full_name: 'Yamileth López', email: 'yamileth@test.com' },
      error: null,
    })

    const { result } = renderCurrentUser()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user?.initials).toBe('YL')
  })

  it('calcula initials de una sola palabra — "Admin" → "AD"', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'admin', tenant_id: 'uuid-1' }),
          user: { id: 'user-id-3', email: 'admin@test.com' },
        },
      },
    })
    mockSingle.mockResolvedValue({
      data: { full_name: 'Admin', email: 'admin@test.com' },
      error: null,
    })

    const { result } = renderCurrentUser()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user?.initials).toBe('AD')
  })

  it('usa session.user.email como fallback cuando el SELECT a dashboard_users falla', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'receptionist', tenant_id: 'uuid-1' }),
          user: { id: 'user-id-4', email: 'recep@clinica.com' },
        },
      },
    })
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Row not found', code: 'PGRST116' },
    })

    const { result } = renderCurrentUser()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user).not.toBeNull()
    expect(result.current.user?.email).toBe('recep@clinica.com')
    expect(result.current.user?.fullName).toBe('recep')
    expect(result.current.user?.role).toBe('receptionist')
  })

  it('retorna user: null cuando no hay sesión activa', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    })

    const { result } = renderCurrentUser()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user).toBeNull()
  })

  it('extrae role de app_role del JWT (no de role)', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'doctor', role: 'authenticated', tenant_id: 'uuid-1' }),
          user: { id: 'user-id-5', email: 'doc@test.com' },
        },
      },
    })
    mockSingle.mockResolvedValue({
      data: { full_name: 'Dr House', email: 'doc@test.com' },
      error: null,
    })

    const { result } = renderCurrentUser()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user?.role).toBe('doctor')
  })

  it('deduplica la sesión y el perfil entre consumidores montados', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: makeJwt({ app_role: 'admin', tenant_id: 'uuid-1' }),
          user: { id: 'user-id-6', email: 'admin@test.com' },
        },
      },
    })
    mockSingle.mockResolvedValue({
      data: { full_name: 'Admin ISADI', email: 'admin@test.com' },
      error: null,
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const first = renderCurrentUser(client)
    const second = renderCurrentUser(client)
    await waitFor(() => {
      expect(first.result.current.isLoading).toBe(false)
      expect(second.result.current.isLoading).toBe(false)
    })

    expect(mockGetSession).toHaveBeenCalledTimes(1)
    expect(mockSingle).toHaveBeenCalledTimes(1)
  })
})
