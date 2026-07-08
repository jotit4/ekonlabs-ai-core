import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { FastAPIClient, FastAPIError } from '@/lib/fastapi/client'
import { logAudit } from '@/lib/audit'

export async function POST(
  _request: Request,
  context: { params: Promise<{ phone: string }> }
) {
  const { phone } = await context.params

  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Obtener tenant_id del JWT
  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Stub de desarrollo: si no hay FASTAPI_BASE_URL, simular éxito
  if (!process.env.FASTAPI_BASE_URL) {
    await logAudit({
      action: 'conversation_released',
      entity_type: 'conversation',
      entity_id: phone,
      supabase,
    })
    return Response.json({ status: 'ok' })
  }

  // 4. Verificar que FASTAPI_API_KEY está disponible antes de crear el cliente (A-04)
  if (!process.env.FASTAPI_API_KEY) {
    return Response.json({ error: 'FastAPI no configurado' }, { status: 503 })
  }

  // 5. Llamar a FastAPI via FastAPIClient (server-side only)
  try {
    const client = new FastAPIClient(
      process.env.FASTAPI_BASE_URL,
      process.env.FASTAPI_API_KEY,
    )
    await client.request<{ status: string }>(
      `/api/v1/tenants/${tenantId}/conversations/${phone}/release`,
      { method: 'POST' }
    )

    // 6. Registrar audit log después del release exitoso
    await logAudit({
      action: 'conversation_released',
      entity_type: 'conversation',
      entity_id: phone,
      supabase,
    })

    return Response.json({ status: 'ok' })
  } catch (err) {
    if (err instanceof FastAPIError) {
      console.error('[release/POST] FastAPIError:', err.status, err.body)
    } else {
      console.error('[release/POST] error:', err)
    }
    return Response.json({ error: 'release_failed' }, { status: 503 })
  }
}
