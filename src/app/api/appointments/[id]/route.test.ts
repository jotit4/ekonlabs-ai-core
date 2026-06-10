import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGetUser, mockGetSession, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser, getSession: mockGetSession },
      from: mockFrom,
    })
  ),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))

import { PATCH } from './route'

// Helper: JWT válido para tests
function makeJwt(claims: Record<string, unknown> = { tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' }) {
  const encoded = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `h.${encoded}.sig`
}

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

function makeRequest(body: unknown = { start_at: '2026-06-01T10:00:00Z', end_at: '2026-06-01T11:00:00Z' }) {
  return new Request(`http://localhost/api/appointments/${VALID_UUID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeContext(id = VALID_UUID) {
  return { params: Promise.resolve({ id }) }
}

// Mock de cadena .update().eq() con count.
// Devuelve el objeto con `update` como vi.fn() expuesto para poder assertear el payload.
function makeUpdateChain(error: null | object = null, count: number = 1) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error, count }),
  })
  return { update }
}

// Story 13.4 (corrección Medium) — cadena .select().eq()...maybeSingle().
// Soporta 1 o 2 .eq() encadenados (appointments lee service_id con 1 .eq;
// service_professionals valida con 2 .eq).
function makeSelectMaybeSingle(result: { data: unknown; error: unknown }) {
  const eq = vi.fn()
  const chain = {
    select: vi.fn().mockReturnValue({ eq }),
    eq,
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  eq.mockReturnValue(chain)
  return chain
}

const NEW_PROFESSIONAL_UUID = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'

// Configura mockFrom para el camino con professional_id: el route hace, en orden,
//   from('appointments').select('service_id')... → service_id del turno
//   from('service_professionals').select('professional_id')... → idoneidad
//   from('appointments').update(...)             → el UPDATE final
// `serviceProfMatch` controla si el profesional atiende el servicio.
function setupReassignFlow(opts: {
  serviceId?: string
  serviceProfMatch?: boolean
  updateError?: null | object
  updateCount?: number
}) {
  const {
    serviceId = 'svc-1',
    serviceProfMatch = true,
    updateError = null,
    updateCount = 1,
  } = opts
  const updateChain = makeUpdateChain(updateError, updateCount)
  mockFrom.mockImplementation((table: string) => {
    if (table === 'service_professionals') {
      return makeSelectMaybeSingle({
        data: serviceProfMatch ? { professional_id: NEW_PROFESSIONAL_UUID } : null,
        error: null,
      })
    }
    // appointments: el primer acceso es el SELECT de service_id, el segundo el UPDATE.
    // Distinguimos por la forma de la cadena: el route llama .select() para leer y
    // .update() para escribir. Devolvemos un objeto que soporta ambos.
    return {
      ...makeSelectMaybeSingle({ data: { service_id: serviceId }, error: null }),
      update: updateChain.update,
    }
  })
  return updateChain
}

describe('PATCH /api/appointments/[id]', () => {
  const validToken = makeJwt({ tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: validToken } },
    })
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it('400 si body es JSON inválido', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const req = new Request(`http://localhost/api/appointments/${VALID_UUID}`, {
      method: 'PATCH',
      body: 'not-json',
    })
    const res = await PATCH(req, makeContext())
    expect(res.status).toBe(400)
  })

  it('404 si el turno no existe (count === 0)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 0))

    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Turno no encontrado')
  })

  it('200 si el turno existe y se actualiza correctamente', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 1))

    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('409 si hay conflicto de slot (error 23505)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain({ code: '23505' }, 0))

    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('slot_conflict')
  })

  it('400 si start_at >= end_at', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await PATCH(
      makeRequest({ start_at: '2026-06-01T11:00:00Z', end_at: '2026-06-01T10:00:00Z' }),
      makeContext()
    )
    expect(res.status).toBe(400)
  })

  // ─── Story 13.4 — Ajuste de sesiones individuales del paquete ────────────────
  describe('Story 13.4 — preservación de la serie + reasignación de profesional', () => {
    it('UPDATE PARCIAL: no incluye package_id/session_index ni toca treatments (AC1/AC2)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      const chain = makeUpdateChain(null, 1)
      mockFrom.mockReturnValue(chain)

      const res = await PATCH(makeRequest(), makeContext())
      expect(res.status).toBe(200)

      // El payload del UPDATE SOLO contiene start_at/end_at (UPDATE parcial).
      const updateArg = chain.update.mock.calls[0][0]
      expect(updateArg).toEqual({
        start_at: '2026-06-01T10:00:00Z',
        end_at: '2026-06-01T11:00:00Z',
      })
      // NO escribe las columnas de la serie → se preservan por construcción.
      expect(updateArg).not.toHaveProperty('package_id')
      expect(updateArg).not.toHaveProperty('session_index')
      expect(updateArg).not.toHaveProperty('sessions_remaining')
      expect(updateArg).not.toHaveProperty('status')

      // Mover ≠ consumir: la tabla treatments NO se toca.
      const tablesAccessed = mockFrom.mock.calls.map((c) => c[0])
      expect(tablesAccessed).not.toContain('treatments')
      expect(tablesAccessed).toContain('appointments')
    })

    it('professional_id en el body (válido para el servicio) → se incluye en el UPDATE (AC4)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      const chain = setupReassignFlow({ serviceProfMatch: true })

      const res = await PATCH(
        makeRequest({
          start_at: '2026-06-01T10:00:00Z',
          end_at: '2026-06-01T11:00:00Z',
          professional_id: NEW_PROFESSIONAL_UUID,
        }),
        makeContext()
      )
      expect(res.status).toBe(200)

      const updateArg = chain.update.mock.calls[0][0]
      expect(updateArg).toEqual({
        start_at: '2026-06-01T10:00:00Z',
        end_at: '2026-06-01T11:00:00Z',
        professional_id: NEW_PROFESSIONAL_UUID,
      })
      // Se consultó service_professionals para validar idoneidad.
      const tablesAccessed = mockFrom.mock.calls.map((c) => c[0])
      expect(tablesAccessed).toContain('service_professionals')
    })

    it('400 professional_service_mismatch si el nuevo profesional NO atiende el servicio (corrección Medium)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      const chain = setupReassignFlow({ serviceProfMatch: false })

      const res = await PATCH(
        makeRequest({
          start_at: '2026-06-01T10:00:00Z',
          end_at: '2026-06-01T11:00:00Z',
          professional_id: NEW_PROFESSIONAL_UUID,
        }),
        makeContext()
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('professional_service_mismatch')
      // No se ejecuta el UPDATE si la validación de idoneidad falla.
      expect(chain.update).not.toHaveBeenCalled()
    })

    it('sin professional_id → el UPDATE NO lo incluye (sin regresión)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      const chain = makeUpdateChain(null, 1)
      mockFrom.mockReturnValue(chain)

      await PATCH(makeRequest(), makeContext())

      const updateArg = chain.update.mock.calls[0][0]
      expect(updateArg).not.toHaveProperty('professional_id')
    })

    it('409 slot_conflict cuando el nuevo profesional está ocupado (23505) (AC4)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      // El profesional SÍ atiende el servicio (validación de idoneidad pasa), pero
      // el slot está ocupado → el UPDATE dispara 23505 → 409.
      setupReassignFlow({ serviceProfMatch: true, updateError: { code: '23505' }, updateCount: 0 })

      const res = await PATCH(
        makeRequest({
          start_at: '2026-06-01T10:00:00Z',
          end_at: '2026-06-01T11:00:00Z',
          professional_id: NEW_PROFESSIONAL_UUID,
        }),
        makeContext()
      )
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toBe('slot_conflict')
    })

    it('400 si professional_id tiene formato inválido (schema) (AC4)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      const res = await PATCH(
        makeRequest({
          start_at: '2026-06-01T10:00:00Z',
          end_at: '2026-06-01T11:00:00Z',
          professional_id: 'no-es-un-uuid',
        }),
        makeContext()
      )
      expect(res.status).toBe(400)
    })
  })
})
