import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockGetSession = vi.hoisted(() => vi.fn())
const mockParseJwt = vi.hoisted(() => vi.fn())
const mockSingle = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
    // Cadena mínima para la lectura de dashboard_users:
    // .from('dashboard_users').select('professional_id').eq('user_id', id).single()
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/utils/jwt', () => ({
  parseJwtPayload: mockParseJwt,
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`)
  },
}))

import Home from './page'

/** Corre la page y devuelve la ruta a la que redirigió. */
async function redirectTarget(): Promise<string> {
  try {
    await Home()
  } catch (e) {
    const msg = (e as Error).message
    if (msg.startsWith('REDIRECT:')) return msg.slice('REDIRECT:'.length)
    throw e
  }
  throw new Error('La page no redirigió')
}

describe('Home (/) — landing por rol tras el login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } } })
    // Default: sin profesional vinculado.
    mockSingle.mockResolvedValue({ data: { professional_id: null } })
  })

  it('sin usuario → /login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect(await redirectTarget()).toBe('/login')
  })

  it('receptionist → /recepcion', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'receptionist' })
    expect(await redirectTarget()).toBe('/recepcion')
  })

  it('doctor vinculado pero SIN subtipo definido → /mi-jornada', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'doctor' })
    mockSingle.mockResolvedValue({ data: { professional_id: 'prof-9', attention_mode: null } })
    expect(await redirectTarget()).toBe('/mi-jornada')
  })

  it('admin SIN profesional vinculado → /inicio (comportamiento previo)', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin' })
    mockSingle.mockResolvedValue({ data: { professional_id: null, attention_mode: null } })
    expect(await redirectTarget()).toBe('/inicio')
  })

  it('admin cuya lectura de dashboard_users falla → /inicio (no rompe el login)', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin' })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await redirectTarget()).toBe('/inicio')
  })

  // ── Subtipo de atención (migración 056) ────────────────────────────────────
  // "Doctor-fila" (walk_in) entra a su día en el Calendario; "Doctor-turno"
  // (appointment) conserva la landing de su rol.

  it('Doctor-fila (walk_in) → su día en el Calendario, en vista Día y filtrado por él', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'doctor' })
    mockSingle.mockResolvedValue({
      data: { professional_id: 'prof-1', attention_mode: 'walk_in' },
    })
    expect(await redirectTarget()).toBe('/agenda?vista=dia&professional_id=prof-1')
  })

  it('Doctor-turno (appointment) → /mi-jornada', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'doctor' })
    mockSingle.mockResolvedValue({
      data: { professional_id: 'prof-2', attention_mode: 'appointment' },
    })
    expect(await redirectTarget()).toBe('/mi-jornada')
  })

  // El caso del Dr. Juan Diego: es admin Y atiende por orden de llegada. El
  // subtipo es ortogonal al rol, así que entra a su día SIN perder permisos.
  it('admin marcado como fila (walk_in) → su día en el Calendario, conservando el rol admin', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin' })
    mockSingle.mockResolvedValue({
      data: { professional_id: 'prof-juan-diego', attention_mode: 'walk_in' },
    })
    expect(await redirectTarget()).toBe('/agenda?vista=dia&professional_id=prof-juan-diego')
  })

  it('admin marcado como turno (appointment) → /inicio (NO lo desvía a la agenda)', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'admin' })
    mockSingle.mockResolvedValue({
      data: { professional_id: 'prof-3', attention_mode: 'appointment' },
    })
    expect(await redirectTarget()).toBe('/inicio')
  })

  it('walk_in SIN profesional vinculado → landing del rol (nunca una pantalla rota)', async () => {
    mockParseJwt.mockReturnValue({ app_role: 'doctor' })
    mockSingle.mockResolvedValue({ data: { professional_id: null, attention_mode: 'walk_in' } })
    expect(await redirectTarget()).toBe('/mi-jornada')
  })

  it('JWT sin rol válido → fallback /agenda', async () => {
    mockParseJwt.mockReturnValue({})
    expect(await redirectTarget()).toBe('/agenda')
  })

  it('usa el claim `role` cuando no viene `app_role`', async () => {
    mockParseJwt.mockReturnValue({ role: 'receptionist' })
    expect(await redirectTarget()).toBe('/recepcion')
  })
})
