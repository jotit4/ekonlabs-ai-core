import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { FastAPIClient } from '@/lib/fastapi/client'

// Lectura: admin, doctor y receptionist. Escritura: admin y receptionist (igual que 6.6).
export const READ_ROLES = ['admin', 'doctor', 'receptionist']
export const WRITE_ROLES = ['admin', 'receptionist']

/**
 * Instancia del cliente FastAPI (server-side). Las env vars NUNCA se exponen al
 * browser; sólo se leen en este módulo (importado únicamente por API Routes).
 * Si faltan, los handlers aplican degradación suave ANTES de usar el client
 * (ver `hasFastapiEnv`).
 */
export const fastapi = new FastAPIClient(
  process.env.FASTAPI_BASE_URL!,
  process.env.FASTAPI_API_KEY!,
)

/** ¿Hay backend configurado? Si no, GET degrada a lista vacía y escrituras a 503. */
export function hasFastapiEnv(): boolean {
  return Boolean(process.env.FASTAPI_BASE_URL && process.env.FASTAPI_API_KEY)
}

/** Validación UUID básica (copiada de appointments/soft-sync/route.ts). */
export function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export interface AuthResult {
  /** `tenant_id` del JWT (nunca del body/cliente — AC9). */
  tenantId: string
}

/**
 * Autentica + autoriza la petición y resuelve el `tenant_id` desde el JWT.
 * Devuelve `{ tenantId }` en éxito o un `Response` de error (401/403/400).
 * El `tenant_id` SIEMPRE sale del JWT, nunca del body/query (AC9).
 */
export async function authorizeKnowledge(
  allowedRoles: string[],
): Promise<AuthResult | Response> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')

  if (!allowedRoles.includes(claims?.app_role as string)) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json(
      { error: 'tenant_id no disponible en el JWT' },
      { status: 400 },
    )
  }

  return { tenantId }
}

/**
 * Mapea un error de `FastAPIClient` a un `Response` del dashboard, sin filtrar
 * `FASTAPI_BASE_URL` ni el body crudo del backend (AC6).
 * - `FastAPIError` con status ≥ 500 → 502 `knowledge_backend_error`.
 * - Otros 4xx (≠ 404, manejado por cada ruta) → propaga el status con `{ error }` genérico.
 * - AbortError (timeout) / error de red → 503 `knowledge_unavailable`.
 */
export function mapFastapiError(err: unknown): Response {
  // console.error server-side para diagnóstico (nunca llega al cliente).
  console.error('[agente/knowledge] backend error:', err)

  if (err instanceof Error && err.name === 'FastAPIError') {
    const status = (err as unknown as { status: number }).status
    if (status >= 500) {
      return Response.json({ error: 'knowledge_backend_error' }, { status: 502 })
    }
    // 4xx genérico (≠404, que se maneja por ruta) — propagar status sin body crudo.
    return Response.json({ error: 'knowledge_request_failed' }, { status })
  }

  // AbortError (timeout 15s) o error de red.
  return Response.json({ error: 'knowledge_unavailable' }, { status: 503 })
}
