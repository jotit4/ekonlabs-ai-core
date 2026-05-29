import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockFrom, mockParseJwt, mockLogAudit, mockCreateSignedUrl } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockGetSession: vi.fn(),
    mockFrom: vi.fn(),
    mockParseJwt: vi.fn(),
    mockLogAudit: vi.fn().mockResolvedValue(undefined),
    mockCreateSignedUrl: vi.fn(),
  }))

vi.mock('server-only', () => ({}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))

const mockStorageFrom = vi.fn(() => ({ createSignedUrl: mockCreateSignedUrl }))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser, getSession: mockGetSession },
      from: mockFrom,
      storage: { from: mockStorageFrom },
    })
  ),
}))

vi.mock('@/lib/utils/jwt', () => ({ parseJwtPayload: mockParseJwt }))

vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }))

import { GET } from './route'

const TENANT = '5298fcc5-15bf-494c-9655-b49d759cfef4'

function makeContext(id: string, docId: string) {
  return { params: Promise.resolve({ id, docId }) }
}

function selectChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: TENANT })
})

describe('GET /api/patients/[id]/documents/[docId]/download', () => {
  it('retorna 401 si no hay sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(new Request('http://localhost'), makeContext('p1', 'doc-1'))
    expect(res.status).toBe(401)
  })

  it('retorna 403 si el rol no tiene acceso', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockParseJwt.mockReturnValueOnce({ app_role: 'agent', tenant_id: TENANT })
    const res = await GET(new Request('http://localhost'), makeContext('p1', 'doc-1'))
    expect(res.status).toBe(403)
  })

  it('retorna 404 si el documento no existe (RLS o id inválido)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockFrom.mockReturnValue(selectChain({ data: null, error: null }))
    const res = await GET(new Request('http://localhost'), makeContext('p1', 'doc-1'))
    expect(res.status).toBe(404)
  })

  it('happy path: genera signed URL y registra audit (200)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockFrom.mockReturnValue(
      selectChain({ data: { storage_path: `${TENANT}/p1/doc-1_orden.pdf` }, error: null })
    )
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/url?token=abc' },
      error: null,
    })

    const res = await GET(new Request('http://localhost'), makeContext('p1', 'doc-1'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string }
    expect(body.url).toContain('https://signed.example')
    // signed URL de corta duración (<= 60s)
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(`${TENANT}/p1/doc-1_orden.pdf`, 60)
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'patient_document_accessed', entity_id: 'p1' })
    )
  })

  it('retorna 500 si falla la generación de la signed URL', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockFrom.mockReturnValue(
      selectChain({ data: { storage_path: `${TENANT}/p1/doc-1_orden.pdf` }, error: null })
    )
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'fail' } })

    const res = await GET(new Request('http://localhost'), makeContext('p1', 'doc-1'))
    expect(res.status).toBe(500)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})
