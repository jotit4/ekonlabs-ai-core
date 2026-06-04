import 'server-only'
import {
  authorizeKnowledge,
  fastapi,
  hasFastapiEnv,
  isUUID,
  mapFastapiError,
  WRITE_ROLES,
} from '@/lib/agente/knowledge-proxy'
import { UpdateKnowledgeSchema } from '@/lib/schemas/agente.schema'
import type { KnowledgeEntry } from '@/types/agente'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await authorizeKnowledge(WRITE_ROLES)
  if (auth instanceof Response) return auth
  const { tenantId } = auth

  const { id } = await params
  if (!isUUID(id)) {
    return Response.json({ error: 'id debe ser un UUID válido' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const parsed = UpdateKnowledgeSchema.safeParse(body)
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
    const entry = await fastapi.request<KnowledgeEntry>(
      `/api/v1/tenants/${tenantId}/knowledge/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      },
    )
    return Response.json(entry)
  } catch (err) {
    // 404 del backend (chunk no es del tenant / no existe) → 404 propio (no 500).
    if (err instanceof Error && err.name === 'FastAPIError') {
      const status = (err as unknown as { status: number }).status
      if (status === 404) {
        return Response.json({ error: 'Entrada no encontrada' }, { status: 404 })
      }
    }
    return mapFastapiError(err)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await authorizeKnowledge(WRITE_ROLES)
  if (auth instanceof Response) return auth
  const { tenantId } = auth

  const { id } = await params
  if (!isUUID(id)) {
    return Response.json({ error: 'id debe ser un UUID válido' }, { status: 400 })
  }

  if (!hasFastapiEnv()) {
    return Response.json({ error: 'knowledge_unavailable' }, { status: 503 })
  }

  try {
    // El backend puede responder 204 (sin body); `FastAPIClient.request` tolera null.
    await fastapi.request<unknown>(
      `/api/v1/tenants/${tenantId}/knowledge/${id}`,
      { method: 'DELETE' },
    )
    return Response.json({ ok: true })
  } catch (err) {
    if (err instanceof Error && err.name === 'FastAPIError') {
      const status = (err as unknown as { status: number }).status
      if (status === 404) {
        return Response.json({ error: 'Entrada no encontrada' }, { status: 404 })
      }
    }
    return mapFastapiError(err)
  }
}
