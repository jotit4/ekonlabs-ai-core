import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted — variables referenciadas en factories de vi.mock ───────────────

const {
  mockGetUser,
  mockGetSession,
  mockFrom,
  mockParseJwt,
  mockLogAudit,
  mockUpload,
  mockRemove,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockParseJwt: vi.fn(),
  mockLogAudit: vi.fn().mockResolvedValue(undefined),
  mockUpload: vi.fn(),
  mockRemove: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))

const mockStorageFrom = vi.fn(() => ({ upload: mockUpload, remove: mockRemove }))

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

import { GET, POST } from './route'

const TENANT = '5298fcc5-15bf-494c-9655-b49d759cfef4'

const mockDoc = {
  document_id: 'doc-uuid-1',
  patient_id: 'p1',
  file_name: 'orden.pdf',
  mime_type: 'application/pdf',
  size_bytes: 2048,
  source: 'manual',
  created_at: '2026-01-01T00:00:00Z',
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

// El entorno de test (jsdom/undici) no preserva File.name/type/size al
// roundtripear multipart por el body de un Request. Construimos un Request
// con formData() mockeado que devuelve el File directamente — equivalente a
// lo que recibe el handler en runtime real.
function makeFormRequest(file: File | null): Request {
  const form = new FormData()
  if (file) form.set('file', file)
  const req = new Request('http://localhost/api/patients/p1/documents', { method: 'POST' })
  Object.defineProperty(req, 'formData', { value: () => Promise.resolve(form), writable: true })
  return req
}

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type })
  // Forzar size — el File real reporta file.size; en el test fijamos el valor.
  Object.defineProperty(file, 'size', { value: size })
  return file
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: TENANT })
})

// ── GET ─────────────────────────────────────────────────────────────────────

describe('GET /api/patients/[id]/documents', () => {
  it('retorna 401 si no hay sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(new Request('http://localhost'), makeContext('p1'))
    expect(res.status).toBe(401)
  })

  it('retorna 403 si el rol no tiene acceso', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockParseJwt.mockReturnValueOnce({ app_role: 'agent', tenant_id: TENANT })
    const res = await GET(new Request('http://localhost'), makeContext('p1'))
    expect(res.status).toBe(403)
  })

  it('retorna 200 con la lista de documentos', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [mockDoc], error: null }),
    }
    mockFrom.mockReturnValue(chain)
    const res = await GET(new Request('http://localhost'), makeContext('p1'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { documents: typeof mockDoc[] }
    expect(body.documents).toHaveLength(1)
    expect(body.documents[0].document_id).toBe('doc-uuid-1')
  })

  it('retorna 500 ante error de DB', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    }
    mockFrom.mockReturnValue(chain)
    const res = await GET(new Request('http://localhost'), makeContext('p1'))
    expect(res.status).toBe(500)
  })
})

// ── POST ────────────────────────────────────────────────────────────────────

describe('POST /api/patients/[id]/documents', () => {
  it('retorna 401 si no hay sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(makeFormRequest(makeFile('a.pdf', 'application/pdf', 10)), makeContext('p1'))
    expect(res.status).toBe(401)
  })

  it('retorna 403 si el rol no tiene acceso', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockParseJwt.mockReturnValueOnce({ app_role: 'agent', tenant_id: TENANT })
    const res = await POST(makeFormRequest(makeFile('a.pdf', 'application/pdf', 10)), makeContext('p1'))
    expect(res.status).toBe(403)
  })

  it('retorna 400 si no se envió archivo', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const res = await POST(makeFormRequest(null), makeContext('p1'))
    expect(res.status).toBe(400)
  })

  it('retorna 400 si el tipo de archivo no está permitido', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const res = await POST(
      makeFormRequest(makeFile('virus.exe', 'application/x-msdownload', 10)),
      makeContext('p1')
    )
    expect(res.status).toBe(400)
  })

  it('happy path: sube a Storage, hace INSERT y registra audit (201)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockUpload.mockResolvedValue({ data: { path: 'x' }, error: null })
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
    }
    mockFrom.mockReturnValue(chain)

    const res = await POST(
      makeFormRequest(makeFile('orden.pdf', 'application/pdf', 2048)),
      makeContext('p1')
    )
    expect(res.status).toBe(201)
    expect(mockUpload).toHaveBeenCalledTimes(1)
    expect(chain.insert).toHaveBeenCalledTimes(1)
    // tenant_id del JWT, source manual, uploaded_by = user.id
    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.tenant_id).toBe(TENANT)
    expect(insertArg.source).toBe('manual')
    expect(insertArg.uploaded_by).toBe('u1')
    expect(insertArg.storage_path).toContain(`${TENANT}/p1/`)
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'patient_document_uploaded', entity_id: 'p1' })
    )
  })

  it('retorna 500 y NO hace rollback si falla el upload a Storage', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockUpload.mockResolvedValue({ data: null, error: { message: 'storage down' } })
    const res = await POST(
      makeFormRequest(makeFile('orden.pdf', 'application/pdf', 2048)),
      makeContext('p1')
    )
    expect(res.status).toBe(500)
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('hace rollback de Storage si el INSERT falla', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockUpload.mockResolvedValue({ data: { path: 'x' }, error: null })
    mockRemove.mockResolvedValue({ data: null, error: null })
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
    }
    mockFrom.mockReturnValue(chain)

    const res = await POST(
      makeFormRequest(makeFile('orden.pdf', 'application/pdf', 2048)),
      makeContext('p1')
    )
    expect(res.status).toBe(500)
    expect(mockRemove).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})
