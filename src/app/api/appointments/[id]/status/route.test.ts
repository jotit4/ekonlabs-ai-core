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

function makeJwt(claims: Record<string, unknown> = { tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' }) {
  const encoded = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `h.${encoded}.sig`
}

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

function makeRequest(body: unknown = { status: 'cancelled' }) {
  return new Request(`http://localhost/api/appointments/${VALID_UUID}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeContext(id = VALID_UUID) {
  return { params: Promise.resolve({ id }) }
}

function makeUpdateChain(error: null | object = null, count: number = 1) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error, count }),
    }),
  }
}

// ── Helpers para el flujo de DECISIÓN de serie (Story 13.6) ──────────────────
// El endpoint, cuando llega `decision`, hace:
//   1. appointments.select('package_id').eq().maybeSingle()
//   2a. (consume) treatments.select('sessions_remaining').eq().maybeSingle()
//   2b. (consume) treatments.update({sessions_remaining}).eq()
//   3. appointments.update({status, [cancellation_reason]}).eq()
// Estos helpers arman mocks por tabla para `mockFrom.mockImplementation`.

function makeAptSelectChain(
  packageId: string | null,
  error: null | object = null,
  aptStatus: string = 'confirmed'
) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: error ? null : { package_id: packageId, status: aptStatus },
          error,
        }),
      }),
    }),
  }
}

function makeTreatmentChain(opts: {
  remaining?: number | null
  readError?: object | null
  updateError?: object | null
  updateCount?: number
  updateSpy?: ReturnType<typeof vi.fn>
}) {
  const {
    remaining = 7,
    readError = null,
    updateError = null,
    updateCount = 1,
    updateSpy,
  } = opts
  const innerUpdate = updateSpy ?? vi.fn()
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: readError || remaining === undefined ? null : { sessions_remaining: remaining },
          error: readError,
        }),
      }),
    }),
    update: vi.fn().mockImplementation((payload: unknown) => {
      innerUpdate(payload)
      // El UPDATE de treatments encadena .eq('treatment_id').eq('sessions_remaining')
      // (concurrencia optimista, CR 13.6)
      return {
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError, count: updateCount }),
        }),
      }
    }),
  }
}

function makeAptUpdateChain(opts: {
  error?: object | null
  count?: number
  updateSpy?: ReturnType<typeof vi.fn>
}) {
  const { error = null, count = 1, updateSpy } = opts
  const innerUpdate = updateSpy ?? vi.fn()
  return {
    update: vi.fn().mockImplementation((payload: unknown) => {
      innerUpdate(payload)
      return { eq: vi.fn().mockResolvedValue({ error, count }) }
    }),
  }
}

describe('PATCH /api/appointments/[id]/status', () => {
  const validToken = makeJwt({ tenant_id: '5298fcc5-15bf-494c-9655-b49d759cfef4' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: validToken } },
    })
  })

  it('400 si el id no es UUID válido', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await PATCH(makeRequest(), makeContext('not-a-uuid'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/inválido/i)
  })

  it('401 si no hay usuario autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await PATCH(makeRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it('400 si body es JSON inválido', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const req = new Request(`http://localhost/api/appointments/${VALID_UUID}/status`, {
      method: 'PATCH',
      body: 'not-json',
    })
    const res = await PATCH(req, makeContext())
    expect(res.status).toBe(400)
  })

  it('400 si status no es permitido', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await PATCH(makeRequest({ status: 'confirmed' }), makeContext())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/cancelled|completed|no_show/i)
  })

  it('400 si status está ausente', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await PATCH(makeRequest({}), makeContext())
    expect(res.status).toBe(400)
  })

  it('404 si el turno no existe (count === 0)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 0))

    const res = await PATCH(makeRequest({ status: 'cancelled' }), makeContext())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Turno no encontrado')
  })

  it('200 al cancelar un turno (status: cancelled)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 1))

    const res = await PATCH(makeRequest({ status: 'cancelled' }), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('200 al marcar asistencia (status: completed)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 1))

    const res = await PATCH(makeRequest({ status: 'completed' }), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('200 al marcar no-show (status: no_show)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain(null, 1))

    const res = await PATCH(makeRequest({ status: 'no_show' }), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('500 si hay error de DB', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeUpdateChain({ message: 'DB error', code: 'PGRST001' }, 0))

    const res = await PATCH(makeRequest({ status: 'cancelled' }), makeContext())
    expect(res.status).toBe(500)
  })

  // ── Story 13.6 — decisión manual de la recepcionista (turnos de serie) ──────
  describe('decisión de serie (Story 13.6)', () => {
    const PACKAGE_ID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890'

    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    })

    it("'consume' decrementa sessions_remaining (7 → 6) y devuelve 200", async () => {
      const treatmentUpdateSpy = vi.fn()
      mockFrom.mockImplementation((table: string) => {
        if (table === 'appointments') {
          // primero el select(package_id), luego el update(status)
          return {
            ...makeAptSelectChain(PACKAGE_ID),
            ...makeAptUpdateChain({ count: 1 }),
          }
        }
        if (table === 'treatments') {
          return makeTreatmentChain({ remaining: 7, updateSpy: treatmentUpdateSpy })
        }
        return makeUpdateChain()
      })

      const res = await PATCH(
        makeRequest({ status: 'no_show', decision: 'consume' }),
        makeContext()
      )
      expect(res.status).toBe(200)
      expect(treatmentUpdateSpy).toHaveBeenCalledWith({ sessions_remaining: 6 })
    })

    it("'consume' con sessions_remaining=0 mantiene piso en 0 (no negativo)", async () => {
      const treatmentUpdateSpy = vi.fn()
      mockFrom.mockImplementation((table: string) => {
        if (table === 'appointments') {
          return { ...makeAptSelectChain(PACKAGE_ID), ...makeAptUpdateChain({ count: 1 }) }
        }
        if (table === 'treatments') {
          return makeTreatmentChain({ remaining: 0, updateSpy: treatmentUpdateSpy })
        }
        return makeUpdateChain()
      })

      const res = await PATCH(
        makeRequest({ status: 'cancelled', decision: 'consume' }),
        makeContext()
      )
      expect(res.status).toBe(200)
      expect(treatmentUpdateSpy).toHaveBeenCalledWith({ sessions_remaining: 0 })
    })

    it('409 decision_already_applied si el turno YA está en el estado solicitado (idempotencia, sin doble descuento)', async () => {
      const treatmentUpdateSpy = vi.fn()
      const aptUpdateSpy = vi.fn()
      mockFrom.mockImplementation((table: string) => {
        if (table === 'appointments') {
          return {
            // El turno ya está no_show → la decisión ya fue aplicada antes
            ...makeAptSelectChain(PACKAGE_ID, null, 'no_show'),
            ...makeAptUpdateChain({ count: 1, updateSpy: aptUpdateSpy }),
          }
        }
        if (table === 'treatments') {
          return makeTreatmentChain({ remaining: 7, updateSpy: treatmentUpdateSpy })
        }
        return makeUpdateChain()
      })

      const res = await PATCH(
        makeRequest({ status: 'no_show', decision: 'consume' }),
        makeContext()
      )
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toBe('decision_already_applied')
      // Ni el status ni el contador se tocan
      expect(aptUpdateSpy).not.toHaveBeenCalled()
      expect(treatmentUpdateSpy).not.toHaveBeenCalled()
    })

    it("'consume' con carrera (primer UPDATE count=0) re-lee y reintenta con éxito → 200", async () => {
      const treatmentUpdateSpy = vi.fn()
      let updateCall = 0
      let selectCall = 0
      mockFrom.mockImplementation((table: string) => {
        if (table === 'appointments') {
          return { ...makeAptSelectChain(PACKAGE_ID), ...makeAptUpdateChain({ count: 1 }) }
        }
        if (table === 'treatments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockImplementation(() => {
                  selectCall++
                  // 1ª lectura: 7. Re-lectura tras carrera: otra pestaña ya bajó a 6.
                  return Promise.resolve({
                    data: { sessions_remaining: selectCall === 1 ? 7 : 6 },
                    error: null,
                  })
                }),
              }),
            }),
            update: vi.fn().mockImplementation((payload: unknown) => {
              treatmentUpdateSpy(payload)
              updateCall++
              const count = updateCall === 1 ? 0 : 1 // 1º intento pierde la carrera
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null, count }),
                }),
              }
            }),
          }
        }
        return makeUpdateChain()
      })

      const res = await PATCH(
        makeRequest({ status: 'no_show', decision: 'consume' }),
        makeContext()
      )
      expect(res.status).toBe(200)
      // 1º intento con el valor leído (7→6), reintento con el re-leído (6→5)
      expect(treatmentUpdateSpy).toHaveBeenNthCalledWith(1, { sessions_remaining: 6 })
      expect(treatmentUpdateSpy).toHaveBeenNthCalledWith(2, { sessions_remaining: 5 })
    })

    it("'recover' NO toca treatments y devuelve 200", async () => {
      const treatmentUpdateSpy = vi.fn()
      mockFrom.mockImplementation((table: string) => {
        if (table === 'appointments') {
          return { ...makeAptSelectChain(PACKAGE_ID), ...makeAptUpdateChain({ count: 1 }) }
        }
        if (table === 'treatments') {
          return makeTreatmentChain({ remaining: 7, updateSpy: treatmentUpdateSpy })
        }
        return makeUpdateChain()
      })

      const res = await PATCH(
        makeRequest({ status: 'no_show', decision: 'recover' }),
        makeContext()
      )
      expect(res.status).toBe(200)
      expect(treatmentUpdateSpy).not.toHaveBeenCalled()
    })

    it("'justify' escribe cancellation_reason y NO toca treatments", async () => {
      const aptUpdateSpy = vi.fn()
      const treatmentUpdateSpy = vi.fn()
      mockFrom.mockImplementation((table: string) => {
        if (table === 'appointments') {
          return {
            ...makeAptSelectChain(PACKAGE_ID),
            ...makeAptUpdateChain({ count: 1, updateSpy: aptUpdateSpy }),
          }
        }
        if (table === 'treatments') {
          return makeTreatmentChain({ remaining: 7, updateSpy: treatmentUpdateSpy })
        }
        return makeUpdateChain()
      })

      const res = await PATCH(
        makeRequest({ status: 'cancelled', decision: 'justify', note: 'aviso anticipado' }),
        makeContext()
      )
      expect(res.status).toBe(200)
      expect(aptUpdateSpy).toHaveBeenCalledWith({
        status: 'cancelled',
        cancellation_reason: 'aviso anticipado',
      })
      expect(treatmentUpdateSpy).not.toHaveBeenCalled()
    })

    it("400 si 'justify' viene con nota vacía", async () => {
      // El schema rechaza antes de tocar la DB.
      const res = await PATCH(
        makeRequest({ status: 'cancelled', decision: 'justify', note: '   ' }),
        makeContext()
      )
      expect(res.status).toBe(400)
    })

    it('400 si decision viene en un turno sin package_id (turno suelto)', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'appointments') {
          return { ...makeAptSelectChain(null), ...makeAptUpdateChain({ count: 1 }) }
        }
        return makeUpdateChain()
      })

      const res = await PATCH(
        makeRequest({ status: 'no_show', decision: 'consume' }),
        makeContext()
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/no pertenece a una serie/i)
    })

    it('400 si decision se combina con status completed', async () => {
      const res = await PATCH(
        makeRequest({ status: 'completed', decision: 'consume' }),
        makeContext()
      )
      expect(res.status).toBe(400)
    })

    it('404 si el turno de serie no existe', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'appointments') {
          // maybeSingle devuelve data: null → 404
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }
        }
        return makeUpdateChain()
      })

      const res = await PATCH(
        makeRequest({ status: 'no_show', decision: 'recover' }),
        makeContext()
      )
      expect(res.status).toBe(404)
    })

    it('flujo legacy SIN decision sigue verde (no regresión, turno suelto)', async () => {
      mockFrom.mockReturnValue(makeUpdateChain(null, 1))
      const res = await PATCH(makeRequest({ status: 'no_show' }), makeContext())
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })
  })
})
