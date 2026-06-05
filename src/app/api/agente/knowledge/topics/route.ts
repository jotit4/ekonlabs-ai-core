import 'server-only'
import {
  authorizeKnowledge,
  fastapi,
  hasFastapiEnv,
  mapFastapiError,
  READ_ROLES,
} from '@/lib/agente/knowledge-proxy'
import type { KnowledgeTopic } from '@/types/agente'

/**
 * `GET /api/agente/knowledge/topics` — lista los "temas" de la KB del tenant
 * (chunks agrupados por `source_filename`). El tenant sale del JWT (Story 6.9).
 */
export async function GET(): Promise<Response> {
  const auth = await authorizeKnowledge(READ_ROLES)
  if (auth instanceof Response) return auth
  const { tenantId } = auth

  // Degradación suave sin backend configurado (dev): lista vacía.
  if (!hasFastapiEnv()) {
    return Response.json({ topics: [] })
  }

  try {
    const data = await fastapi.request<{ topics: KnowledgeTopic[] }>(
      `/api/v1/tenants/${tenantId}/knowledge/topics`,
    )
    return Response.json({ topics: data.topics ?? [] })
  } catch (err) {
    return mapFastapiError(err)
  }
}
