import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { FastAPIClient } from '@/lib/fastapi/client'

const fastapi = new FastAPIClient(
  process.env.FASTAPI_BASE_URL!,
  process.env.FASTAPI_API_KEY!,
)

// Validación UUID básica (no importar zod en la route — mantener ligero)
function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function POST(request: Request) {
  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 2. Parsear body — patient_id requerido
  let body: { patient_id?: string } = {}
  try {
    body = await request.json().catch(() => ({}))
  } catch {
    body = {}
  }

  if (!body.patient_id) {
    return Response.json({ error: 'patient_id requerido' }, { status: 400 })
  }

  if (!isUUID(body.patient_id)) {
    return Response.json({ error: 'patient_id debe ser un UUID válido' }, { status: 400 })
  }

  // 3. Stub: si FastAPI no está disponible en dev, retornar 'pending'
  if (!process.env.FASTAPI_BASE_URL) {
    return Response.json({ status: 'pending' }, { status: 202 })
  }

  // 4. Llamar a FastAPI (server-side — FASTAPI_BASE_URL nunca llega al cliente)
  try {
    const result = await fastapi.request<{
      status: 'pending' | 'completed'
      job_id?: string
      affected_dates?: string[]
    }>(
      '/api/v1/appointments/soft-sync',
      {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, patient_id: body.patient_id }),
      }
    )

    const httpStatus = result.status === 'pending' ? 202 : 200
    return Response.json(result, { status: httpStatus })
  } catch (err) {
    // FastAPIError con status 404 — paciente sin calendario o no encontrado
    if (err instanceof Error && err.name === 'FastAPIError') {
      const fastapiErr = err as unknown as { status: number; body: unknown }
      if (fastapiErr.status === 404) {
        return Response.json({ status: 'not_found' }, { status: 200 })
      }
    }
    // AbortError (timeout 5s) o error de red o 5xx
    console.error('[appointments/soft-sync/POST] error:', err)
    return Response.json({ status: 'error', message: 'sync_unavailable' }, { status: 503 })
  }
}
