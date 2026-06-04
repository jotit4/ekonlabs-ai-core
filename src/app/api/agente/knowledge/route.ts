import 'server-only'
import {
  authorizeKnowledge,
  fastapi,
  hasFastapiEnv,
  mapFastapiError,
  READ_ROLES,
  WRITE_ROLES,
} from '@/lib/agente/knowledge-proxy'
import { CreateKnowledgeSchema } from '@/lib/schemas/agente.schema'
import type { KnowledgeEntry, KnowledgeListResponse } from '@/types/agente'

export async function GET(): Promise<Response> {
  const auth = await authorizeKnowledge(READ_ROLES)
  if (auth instanceof Response) return auth
  const { tenantId } = auth

  // Degradación suave sin backend configurado (dev): lista vacía.
  if (!hasFastapiEnv()) {
    return Response.json({ entries: [] })
  }

  try {
    const data = await fastapi.request<KnowledgeListResponse>(
      `/api/v1/tenants/${tenantId}/knowledge`,
    )
    return Response.json({ entries: data.entries ?? [] })
  } catch (err) {
    return mapFastapiError(err)
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeKnowledge(WRITE_ROLES)
  if (auth instanceof Response) return auth
  const { tenantId } = auth

  const body = await request.json().catch(() => null)
  const parsed = CreateKnowledgeSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Datos inválidos', details: parsed.error.issues },
      { status: 400 },
    )
  }

  // `source_filename` por defecto "general" si se omite o quedó vacío tras trim.
  const content = parsed.data.content
  const source_filename = parsed.data.source_filename || 'general'

  // Sin backend → no se inventan escrituras.
  if (!hasFastapiEnv()) {
    return Response.json({ error: 'knowledge_unavailable' }, { status: 503 })
  }

  try {
    const entry = await fastapi.request<KnowledgeEntry>(
      `/api/v1/tenants/${tenantId}/knowledge`,
      {
        method: 'POST',
        body: JSON.stringify({ content, source_filename }),
      },
    )
    return Response.json(entry, { status: 201 })
  } catch (err) {
    return mapFastapiError(err)
  }
}
