import 'server-only'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { FastAPIClient, FastAPIError } from '@/lib/fastapi/client'
import type { RetentionStatusResponse } from '@/types/retention'

export async function GET(): Promise<NextResponse> {
  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const claims = parseJwtPayload(session?.access_token ?? '')

  if (claims?.app_role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 2. Verificar que FASTAPI_BASE_URL está configurada (A-05: no conectar a localhost en producción)
  if (!process.env.FASTAPI_BASE_URL) {
    return NextResponse.json({ error: 'FastAPI no configurado' }, { status: 503 })
  }

  // 3. Llamar FastAPI (server-side, FASTAPI_BASE_URL never exposed to browser)
  const client = new FastAPIClient(
    process.env.FASTAPI_BASE_URL,
    process.env.FASTAPI_API_KEY ?? '',
  )

  try {
    const data = await client.request<RetentionStatusResponse>('/api/v1/retention/status')
    return NextResponse.json({ status: 'ok', data })
  } catch (err) {
    if (err instanceof FastAPIError && err.status === 404) {
      return NextResponse.json({ status: 'not_implemented', data: null })
    }
    // AbortError (timeout) or any other FastAPI error — degrade gracefully
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ status: 'degraded', data: null, message })
  }
}
