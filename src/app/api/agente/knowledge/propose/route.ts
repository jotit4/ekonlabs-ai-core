import 'server-only'
import {
  authorizeKnowledge,
  fastapi,
  hasFastapiEnv,
  mapFastapiError,
  WRITE_ROLES,
} from '@/lib/agente/knowledge-proxy'
import { KBProposeSchema } from '@/lib/schemas/agente.schema'
import type { KBProposalResponse } from '@/types/agente'

/**
 * `POST /api/agente/knowledge/propose` — genera una propuesta de corrección
 * (diff sugerido) para la base de conocimiento. Es read-only: el backend NO
 * persiste nada, por lo que NO se invalida cache ni se loguea audit (Story 6.9).
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeKnowledge(WRITE_ROLES)
  if (auth instanceof Response) return auth
  const { tenantId } = auth

  if (!hasFastapiEnv()) {
    return Response.json({ error: 'knowledge_unavailable' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const parsed = KBProposeSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Datos inválidos', details: parsed.error.issues },
      { status: 400 },
    )
  }

  try {
    const data = await fastapi.request<KBProposalResponse>(
      `/api/v1/tenants/${tenantId}/knowledge/propose`,
      {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      },
    )
    return Response.json(data)
  } catch (err) {
    return mapFastapiError(err)
  }
}
