import { vi, describe, it, expect, beforeEach } from 'vitest'

// vi.hoisted — factories de mock
const { mockGetUser, mockGetSession, mockFrom, mockRpc, mockParseJwt } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockParseJwt: vi.fn().mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' }),
}))

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}))

// Mock createSupabaseServerClient
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
        getSession: mockGetSession,
      },
      from: mockFrom,
      rpc: mockRpc,
    })
  ),
}))

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

import { GET } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// El GET ahora hace 3 llamadas a from() en paralelo vía Promise.all:
//   1. patients → select().in()
//   2. conversation_reads → select().in()
//   3. conversation_resolutions → select().in()

interface PatientRow { phone_number: string; full_name: string }
interface ReadRow { phone_number: string; last_read_at: string }
interface ResolutionRow { phone_number: string; resolved_at: string | null }

const makeSelectIn = (data: unknown[]) => ({
  select: vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ data, error: null }),
  }),
})

// Configura mockFrom con mockReturnValueOnce en orden: patients, reads, resolutions.
// IMPORTANTE: limpia mocks previos con mockReset antes de configurar.
function mockFromAll(
  patients: PatientRow[] = [],
  reads: ReadRow[] = [],
  resolutions: ResolutionRow[] = []
) {
  mockFrom.mockReset()
  mockFrom
    .mockReturnValueOnce(makeSelectIn(patients))
    .mockReturnValueOnce(makeSelectIn(reads))
    .mockReturnValueOnce(makeSelectIn(resolutions))
}

// Alias para tests que no se preocupan de reads/resolutions
function mockPatients(patients: PatientRow[] = []) {
  mockFromAll(patients, [], [])
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: admin autenticado con sesión válida
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'mock-admin-token' } },
    })
    mockParseJwt.mockReturnValue({ app_role: 'admin', tenant_id: 'tenant-1' })
    mockPatients([])
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await GET()

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autorizado')
  })

  it('200 — receptionist tiene acceso (usuario primario del módulo)', async () => {
    mockParseJwt.mockReturnValueOnce({
      app_role: 'receptionist',
      tenant_id: 'tenant-1',
    })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })

    const res = await GET()

    expect(res.status).toBe(200)
  })

  it('403 si el rol no está en el allowlist', async () => {
    mockParseJwt.mockReturnValueOnce({
      app_role: 'unknown_role',
      tenant_id: 'tenant-1',
    })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const res = await GET()

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Acceso denegado')
  })

  it('retorna lista vacía si la RPC devuelve []', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversations).toEqual([])
  })

  it('500 si la RPC get_tenant_conversations_overview falla', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const res = await GET()

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Error al obtener conversaciones')
  })

  it('conversación CON thread_state deriva el status correctamente (paused+low_confidence → needs_intervention)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+5491111111111',
          last_content: 'Necesito ayuda urgente',
          last_role: 'user',
          last_created_at: '2026-05-11T14:00:00.000Z',
          ts_status: 'paused',
          ts_paused_reason: 'low_confidence',
          ts_updated_at: '2026-05-11T14:00:00.000Z',
        },
      ],
      error: null,
    })
    mockPatients([])

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversations).toHaveLength(1)
    expect(body.conversations[0].status).toBe('needs_intervention')
    expect(body.conversations[0].confidence_level).toBe('low')
    expect(body.conversations[0].phone_number).toBe('+5491111111111')
    expect(body.conversations[0].last_message_preview).toBe('Necesito ayuda urgente')
  })

  it('confidence_level es medium cuando paused_reason no es null ni low_confidence', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+5491111111111',
          last_content: 'hola',
          last_role: 'user',
          last_created_at: '2026-05-11T14:00:00.000Z',
          ts_status: 'paused',
          ts_paused_reason: 'human_takeover',
          ts_updated_at: '2026-05-11T14:00:00.000Z',
        },
      ],
      error: null,
    })
    mockPatients([])

    const res = await GET()
    const body = await res.json()
    expect(body.conversations[0].status).toBe('human_takeover')
    expect(body.conversations[0].confidence_level).toBe('medium')
  })

  it('conversación SIN thread_state (ts_status=null) aparece en estado ai_active (caso +5492617198342)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+5492617198342',
          last_content: 'Quiero un turno',
          last_role: 'user',
          last_created_at: '2026-05-20T10:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })
    mockPatients([])

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversations).toHaveLength(1)
    expect(body.conversations[0].phone_number).toBe('+5492617198342')
    expect(body.conversations[0].status).toBe('ai_active')
    expect(body.conversations[0].confidence_level).toBe('high')
    expect(body.conversations[0].last_message_at).toBe('2026-05-20T10:00:00.000Z')
  })

  it('mezcla con y sin thread_state: todas presentes, orden por urgencia + last_message_at DESC', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        // sin thread_state → ai_active (urgencia 2)
        {
          phone_number: '+5490000000001',
          last_content: 'a',
          last_role: 'user',
          last_created_at: '2026-05-20T09:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
        // paused+low_confidence → needs_intervention (urgencia 0)
        {
          phone_number: '+5490000000002',
          last_content: 'b',
          last_role: 'user',
          last_created_at: '2026-05-20T08:00:00.000Z',
          ts_status: 'paused',
          ts_paused_reason: 'low_confidence',
          ts_updated_at: '2026-05-20T08:00:00.000Z',
        },
        // sin thread_state, más reciente → ai_active (urgencia 2)
        {
          phone_number: '+5490000000003',
          last_content: 'c',
          last_role: 'user',
          last_created_at: '2026-05-20T11:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })
    mockPatients([])

    const res = await GET()
    const body = await res.json()

    expect(body.conversations).toHaveLength(3)
    // needs_intervention primero; luego los dos ai_active por last_message_at DESC
    expect(body.conversations.map((c: { phone_number: string }) => c.phone_number)).toEqual([
      '+5490000000002',
      '+5490000000003',
      '+5490000000001',
    ])
  })

  it('mapea patient_name desde patients y cae al phone_number si no hay match', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+5490000000001',
          last_content: 'a',
          last_role: 'user',
          last_created_at: '2026-05-20T09:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
        {
          phone_number: '+5490000000002',
          last_content: 'b',
          last_role: 'user',
          last_created_at: '2026-05-20T08:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })
    mockFromAll(
      [{ phone_number: '+5490000000001', full_name: 'Juan Pérez' }],
      [],
      []
    )

    const res = await GET()
    const body = await res.json()
    const byPhone = Object.fromEntries(
      body.conversations.map((c: { phone_number: string; patient_name: string }) => [
        c.phone_number,
        c.patient_name,
      ])
    )
    expect(byPhone['+5490000000001']).toBe('Juan Pérez')
    expect(byPhone['+5490000000002']).toBe('+5490000000002')
  })

  it('excluye el ruido de Evolution (+123456) de la bandeja aunque la RPC lo devuelva', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+123456',
          last_content: '🚀 Connection successfully established!',
          last_role: 'system',
          last_created_at: '2026-05-20T12:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
        {
          phone_number: '+5492617198342',
          last_content: 'Hola',
          last_role: 'user',
          last_created_at: '2026-05-20T10:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })
    mockPatients([])

    const res = await GET()
    const body = await res.json()

    const phones = body.conversations.map((c: { phone_number: string }) => c.phone_number)
    expect(phones).not.toContain('+123456')
    expect(phones).toContain('+5492617198342')
    expect(body.conversations).toHaveLength(1)
  })

  it('lista vacía si tras excluir el ruido de Evolution no queda ninguna conversación', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+123456',
          last_content: '🚀 Connection successfully established!',
          last_role: 'system',
          last_created_at: '2026-05-20T12:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })

    const res = await GET()
    const body = await res.json()
    expect(body.conversations).toEqual([])
  })

  // ─── B1 — is_unread real ──────────────────────────────────────────────────

  it('B1: is_unread=true cuando last_role=user y no hay registro de lectura', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+5491111111111',
          last_content: 'Hola',
          last_role: 'user',
          last_created_at: '2026-06-25T10:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })
    // reads: vacío (sin lectura previa)
    mockFromAll([], [], [])

    const res = await GET()
    const body = await res.json()
    expect(body.conversations[0].is_unread).toBe(true)
  })

  it('B1: is_unread=false cuando last_role=assistant', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+5491111111111',
          last_content: 'Turno confirmado',
          last_role: 'assistant',
          last_created_at: '2026-06-25T10:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })
    mockFromAll([], [], [])

    const res = await GET()
    const body = await res.json()
    expect(body.conversations[0].is_unread).toBe(false)
  })

  it('B1: is_unread=false cuando last_read_at es posterior al último mensaje', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+5491111111111',
          last_content: 'Hola',
          last_role: 'user',
          last_created_at: '2026-06-25T10:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })
    // La lectura ocurrió DESPUÉS del último mensaje → ya leído
    mockFromAll(
      [],
      [{ phone_number: '+5491111111111', last_read_at: '2026-06-25T11:00:00.000Z' }],
      []
    )

    const res = await GET()
    const body = await res.json()
    expect(body.conversations[0].is_unread).toBe(false)
  })

  it('B1: is_unread=true cuando last_read_at es anterior al último mensaje', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+5491111111111',
          last_content: 'Nuevo mensaje',
          last_role: 'user',
          last_created_at: '2026-06-25T12:00:00.000Z',
          ts_status: null,
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })
    // La lectura ocurrió ANTES del último mensaje → no leído
    mockFromAll(
      [],
      [{ phone_number: '+5491111111111', last_read_at: '2026-06-25T10:00:00.000Z' }],
      []
    )

    const res = await GET()
    const body = await res.json()
    expect(body.conversations[0].is_unread).toBe(true)
  })

  // ─── B2 — is_resolved override ────────────────────────────────────────────

  it('B2: status=resolved cuando existe resolución y no llegó mensaje posterior', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+5491111111111',
          last_content: 'Gracias',
          last_role: 'user',
          last_created_at: '2026-06-25T10:00:00.000Z',
          ts_status: 'active',
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })
    // resolved_at es posterior al último mensaje → está resuelta
    mockFromAll(
      [],
      [],
      [{ phone_number: '+5491111111111', resolved_at: '2026-06-25T11:00:00.000Z' }]
    )

    const res = await GET()
    const body = await res.json()
    expect(body.conversations[0].status).toBe('resolved')
  })

  it('B2: auto-reabre si llegó un mensaje DESPUÉS de la resolución', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+5491111111111',
          last_content: 'Quiero otro turno',
          last_role: 'user',
          // El último mensaje es POSTERIOR a la resolución
          last_created_at: '2026-06-25T13:00:00.000Z',
          ts_status: 'active',
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })
    mockFromAll(
      [],
      [],
      [{ phone_number: '+5491111111111', resolved_at: '2026-06-25T11:00:00.000Z' }]
    )

    const res = await GET()
    const body = await res.json()
    // Auto-reabre → status vuelve a derivarse normalmente (active → ai_active)
    expect(body.conversations[0].status).toBe('ai_active')
  })

  it('B2: resolved_at=null en la tabla no override el status', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          phone_number: '+5491111111111',
          last_content: 'Hola',
          last_role: 'user',
          last_created_at: '2026-06-25T10:00:00.000Z',
          ts_status: 'active',
          ts_paused_reason: null,
          ts_updated_at: null,
        },
      ],
      error: null,
    })
    // resolved_at=null → reabierta, no debe override
    mockFromAll(
      [],
      [],
      [{ phone_number: '+5491111111111', resolved_at: null }]
    )

    const res = await GET()
    const body = await res.json()
    expect(body.conversations[0].status).toBe('ai_active')
  })
})
