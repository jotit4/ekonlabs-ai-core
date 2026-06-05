import 'server-only'
import {
  authorizeKnowledge,
  fastapi,
  hasFastapiEnv,
  mapFastapiError,
  WRITE_ROLES,
} from '@/lib/agente/knowledge-proxy'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { KBTopicReindexSchema } from '@/lib/schemas/agente.schema'

/**
 * Valida el `source` (nombre de tema, no UUID): no vacío, ≤120 chars y sin
 * caracteres de control. Devuelve el source ya decodificado, o `null` si es
 * inválido.
 */
function validateSource(raw: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }
  const trimmed = decoded.trim()
  if (trimmed.length === 0 || trimmed.length > 120) return null
  // Sin caracteres de control (C0: U+0000-U+001F y DEL U+007F, incluye saltos/tabs/NUL).
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null
  return trimmed
}

/**
 * `PUT /api/agente/knowledge/topics/[source]` — reindexa un tema completo:
 * el `content` reemplaza todo el texto del tema (Story 6.9). Audita
 * `kb_topic_reindexed`.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ source: string }> },
): Promise<Response> {
  const auth = await authorizeKnowledge(WRITE_ROLES)
  if (auth instanceof Response) return auth
  const { tenantId } = auth

  const { source: rawSource } = await params
  const source = validateSource(rawSource)
  if (source === null) {
    return Response.json({ error: 'source inválido' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const parsed = KBTopicReindexSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Datos inválidos', details: parsed.error.issues },
      { status: 400 },
    )
  }

  if (!hasFastapiEnv()) {
    return Response.json({ error: 'knowledge_unavailable' }, { status: 503 })
  }

  try {
    const data = await fastapi.request<unknown>(
      `/api/v1/tenants/${tenantId}/knowledge/topics/${encodeURIComponent(source)}`,
      {
        method: 'PUT',
        body: JSON.stringify(parsed.data),
      },
    )

    // Audit: logAudit swallows its own errors (no rompe la respuesta).
    const supabase = await createSupabaseServerClient()
    await logAudit({
      action: 'kb_topic_reindexed',
      entity_type: 'knowledge',
      entity_id: source,
      supabase,
    })

    return Response.json(data)
  } catch (err) {
    return mapFastapiError(err)
  }
}

/**
 * `DELETE /api/agente/knowledge/topics/[source]` — borra un tema completo
 * (todos sus chunks) (Story 6.9). Audita `kb_topic_deleted`.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ source: string }> },
): Promise<Response> {
  const auth = await authorizeKnowledge(WRITE_ROLES)
  if (auth instanceof Response) return auth
  const { tenantId } = auth

  const { source: rawSource } = await params
  const source = validateSource(rawSource)
  if (source === null) {
    return Response.json({ error: 'source inválido' }, { status: 400 })
  }

  if (!hasFastapiEnv()) {
    return Response.json({ error: 'knowledge_unavailable' }, { status: 503 })
  }

  try {
    const data = await fastapi.request<unknown>(
      `/api/v1/tenants/${tenantId}/knowledge/topics/${encodeURIComponent(source)}`,
      { method: 'DELETE' },
    )

    const supabase = await createSupabaseServerClient()
    await logAudit({
      action: 'kb_topic_deleted',
      entity_type: 'knowledge',
      entity_id: source,
      supabase,
    })

    return Response.json(data ?? { ok: true })
  } catch (err) {
    return mapFastapiError(err)
  }
}
