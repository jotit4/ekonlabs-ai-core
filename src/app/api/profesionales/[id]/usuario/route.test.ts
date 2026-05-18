import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── vi.hoisted ────────────────────────────────────────────────────────────────

const { mockGetUser, mockGetSession, mockParseJwt, mockFrom, mockLogAudit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockParseJwt: vi.fn(),
  mockFrom: vi.fn(),
  mockLogAudit: vi.fn(),
}))

const mockInviteUserByEmail = vi.hoisted(() => vi.fn())
const mockDeleteUser = vi.hoisted(() => vi.fn())
const mockAdminFrom = vi.hoisted(() => vi.fn())

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser, getSession: mockGetSession },
      from: mockFrom,
    })
  ),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: {
      admin: {
        inviteUserByEmail: mockInviteUserByEmail,
        deleteUser: mockDeleteUser,
      },
    },
    from: mockAdminFrom,
  })),
}))

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

vi.mock('@/lib/audit', () => ({
  logAudit: mockLogAudit,
}))

vi.mock('@/lib/schemas/profesionales.schema', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/schemas/profesionales.schema')>()
  return original
})

import { POST } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJwt(role: string, tenantId = 'tenant-1') {
  return Buffer.from(JSON.stringify({ app_role: role, tenant_id: tenantId })).toString('base64')
}

function makeRequest(body: unknown, professionalId = 'prof-uuid-1') {
  return new Request(`http://localhost/api/profesionales/${professionalId}/usuario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id = 'prof-uuid-1') {
  return { params: Promise.resolve({ id }) }
}

function setupAdminAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-user-id' } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: makeJwt('admin') } },
  })
  mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
}

function setupProfessionalQuery(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  mockFrom.mockReturnValue({ select })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/profesionales/[id]/usuario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  it('retorna 401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await POST(makeRequest({ email: 'doc@test.com' }), makeParams())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autorizado')
  })

  it('retorna 403 si el rol es doctor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('doctor') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'doctor', tenant_id: 'tenant-1' })

    const res = await POST(makeRequest({ email: 'doc@test.com' }), makeParams())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('Solo admin o receptionist')
  })

  it('retorna 400 si el email es inválido', async () => {
    setupAdminAuth()

    const res = await POST(makeRequest({ email: 'not-an-email' }), makeParams())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Datos inválidos')
  })

  it('retorna 404 si el profesional no existe', async () => {
    setupAdminAuth()
    setupProfessionalQuery(null, { message: 'No rows found' })

    const res = await POST(makeRequest({ email: 'doc@test.com' }), makeParams())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Profesional no encontrado')
  })

  it('retorna 409 si el profesional ya tiene usuario vinculado', async () => {
    setupAdminAuth()
    setupProfessionalQuery({ professional_id: 'prof-uuid-1', name: 'Dr. García', email: 'garcia@clinica.com' })

    // Admin query a dashboard_users retorna usuario existente
    const existingSingle = vi.fn().mockResolvedValue({
      data: { user_id: 'existing-user', email: 'existing@test.com' },
      error: null,
    })
    const existingEq = vi.fn().mockReturnValue({ single: existingSingle })
    const existingSelect = vi.fn().mockReturnValue({ eq: existingEq })
    mockAdminFrom.mockReturnValue({ select: existingSelect })

    const res = await POST(makeRequest({ email: 'doc@test.com' }), makeParams())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('ya tiene una cuenta de usuario')
  })

  it('retorna 409 si el email ya existe en Supabase Auth', async () => {
    setupAdminAuth()
    setupProfessionalQuery({ professional_id: 'prof-uuid-1', name: 'Dr. García', email: 'garcia@clinica.com' })

    // Sin usuario vinculado
    const noLinkSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    const noLinkEq = vi.fn().mockReturnValue({ single: noLinkSingle })
    const noLinkSelect = vi.fn().mockReturnValue({ eq: noLinkEq })
    mockAdminFrom.mockReturnValue({ select: noLinkSelect })

    // Invite retorna error de duplicado
    mockInviteUserByEmail.mockResolvedValue({
      data: null,
      error: { message: 'User already exists in the system' },
    })

    const res = await POST(makeRequest({ email: 'existing@test.com' }), makeParams())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Ya existe un usuario con ese email')
  })

  it('crea el usuario y retorna 201 cuando todo está bien', async () => {
    setupAdminAuth()
    setupProfessionalQuery({ professional_id: 'prof-uuid-1', name: 'Dr. García', email: 'garcia@clinica.com' })

    // Sin usuario vinculado
    const noLinkSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    const noLinkEq = vi.fn().mockReturnValue({ single: noLinkSingle })
    const noLinkSelect = vi.fn().mockReturnValue({ eq: noLinkEq })

    // Insert dashboard_users
    const insertSingle = vi.fn().mockResolvedValue({
      data: { user_id: 'new-user-uuid', email: 'doc@test.com', full_name: 'Dr. García' },
      error: null,
    })
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: insertSelect })

    let callCount = 0
    mockAdminFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { select: noLinkSelect }  // check existing link
      return { insert: mockInsert }  // insert dashboard_users
    })

    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'new-user-uuid' } },
      error: null,
    })
    mockLogAudit.mockResolvedValue(undefined)

    const res = await POST(makeRequest({ email: 'doc@test.com' }), makeParams())
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.user_id).toBe('new-user-uuid')
    expect(body.data.email).toBe('doc@test.com')
    expect(body.data.full_name).toBe('Dr. García')
    expect(mockInviteUserByEmail).toHaveBeenCalledWith('doc@test.com', {
      redirectTo: 'http://localhost:3000/',
    })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user_created', entity_type: 'user' })
    )
  })

  it('elimina el usuario de auth si el INSERT en dashboard_users falla', async () => {
    setupAdminAuth()
    setupProfessionalQuery({ professional_id: 'prof-uuid-1', name: 'Dr. García', email: 'garcia@clinica.com' })

    const noLinkSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    const noLinkEq = vi.fn().mockReturnValue({ single: noLinkSingle })
    const noLinkSelect = vi.fn().mockReturnValue({ eq: noLinkEq })

    // INSERT falla
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'DB error' },
    })
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: insertSelect })

    let callCount = 0
    mockAdminFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { select: noLinkSelect }
      return { insert: mockInsert }
    })

    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'new-user-uuid' } },
      error: null,
    })
    mockDeleteUser.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ email: 'doc@test.com' }), makeParams())
    expect(res.status).toBe(500)
    expect(mockDeleteUser).toHaveBeenCalledWith('new-user-uuid')
  })

  it('acepta rol receptionist además de admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'recep-id' } }, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: makeJwt('receptionist') } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'receptionist', tenant_id: 'tenant-1' })

    setupProfessionalQuery({ professional_id: 'prof-uuid-1', name: 'Dr. García', email: 'garcia@clinica.com' })

    const noLinkSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    const noLinkEq = vi.fn().mockReturnValue({ single: noLinkSingle })
    const noLinkSelect = vi.fn().mockReturnValue({ eq: noLinkEq })

    const insertSingle = vi.fn().mockResolvedValue({
      data: { user_id: 'new-uuid', email: 'doc@test.com', full_name: 'Dr. García' },
      error: null,
    })
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: insertSelect })

    let callCount = 0
    mockAdminFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { select: noLinkSelect }
      return { insert: mockInsert }
    })

    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'new-uuid' } },
      error: null,
    })
    mockLogAudit.mockResolvedValue(undefined)

    const res = await POST(makeRequest({ email: 'doc@test.com' }), makeParams())
    expect(res.status).toBe(201)
  })
})
