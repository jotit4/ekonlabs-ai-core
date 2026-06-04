import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { isEvolutionPhone } from '@/lib/conversations/evolution-noise'
import type { ConversationSummary, ConversationStatus, ConfidenceLevel } from '@/types/conversations'

// Fila devuelta por la RPC get_tenant_conversations_overview (Story 4.8)
interface ConversationOverviewRow {
  phone_number: string
  last_content: string | null
  last_role: string | null
  last_created_at: string
  ts_status: string | null
  ts_paused_reason: string | null
  ts_updated_at: string | null
}

// ─── Helpers de derivación de estado ─────────────────────────────────────────

function deriveStatus(status: string, pausedReason: string | null): ConversationStatus {
  if (status === 'paused' && pausedReason === 'human_takeover') return 'human_takeover'
  if (status === 'paused' && pausedReason === 'low_confidence') return 'needs_intervention'
  if (status === 'active') return 'ai_active'
  return 'resolved'
}

function deriveConfidence(pausedReason: string | null): ConfidenceLevel {
  if (pausedReason === 'low_confidence') return 'low'
  if (pausedReason !== null) return 'medium'
  return 'high'
}

const URGENCY_ORDER: Record<ConversationStatus, number> = {
  needs_intervention: 0,
  human_takeover: 1,
  ai_active: 2,
  resolved: 3,
}

// ─── GET /api/conversations ───────────────────────────────────────────────────

export async function GET() {
  // 1. Validar sesión — RLS requiere usuario autenticado
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Check de rol: solo admin y doctor pueden ver la bandeja de conversaciones IA (A-02)
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  const appRole = claims?.app_role as string | undefined
  if (!['admin', 'doctor'].includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 2. Derivar la bandeja desde `conversations` (fuente de verdad) — Story 4.8.
  // La RPC SECURITY DEFINER hace DISTINCT ON (phone_number) sobre conversations
  // (último mensaje por número) + LEFT JOIN a thread_states para el estado del
  // agente (NULL si no existe). Aísla por tenant vía auth.jwt() ->> 'tenant_id'
  // internamente — NO se pasa tenant_id por parámetro ni body (AR14).
  // Así, una conversación con mensajes pero SIN thread_state (huérfana por fallo
  // transitorio del upsert del backend) SÍ aparece, en estado ai_active.
  const { data: overview, error: overviewError } = await supabase.rpc(
    'get_tenant_conversations_overview'
  )

  if (overviewError) {
    console.error('[conversations/GET] overview RPC error:', overviewError)
    return Response.json({ error: 'Error al obtener conversaciones' }, { status: 500 })
  }

  const rows = (overview ?? []) as ConversationOverviewRow[]

  // Excluir el ruido de infraestructura de Evolution API de la BANDEJA (AC2).
  // '+123456' (contacto "EvolutionAPI") está persistido en `conversations` →
  // sin este filtro aparecería en la lista. Constante centralizada en evolution-noise.
  const visibleRows = rows.filter((row) => !isEvolutionPhone(row.phone_number))

  if (!visibleRows.length) {
    return Response.json({ conversations: [] })
  }

  const phoneNumbers = visibleRows.map((row) => row.phone_number)

  // 3. Obtener nombres de pacientes por phone_number (RLS filtra por tenant — AR14)
  const { data: patients } = await supabase
    .from('patients')
    .select('phone_number, full_name')
    .in('phone_number', phoneNumbers)

  const nameByPhone = new Map<string, string>(
    (patients ?? []).map((p) => [p.phone_number, p.full_name])
  )

  // 4. Construir ConversationSummary[]. Si no hay thread_state (ts_status === null)
  // el default es status='active' / paused_reason=null → deriveStatus → ai_active.
  const conversations: ConversationSummary[] = visibleRows.map((row) => {
    const status = row.ts_status ?? 'active'
    const pausedReason = row.ts_paused_reason ?? null
    const convStatus = deriveStatus(status, pausedReason)
    const preview = row.last_content?.slice(0, 80) ?? ''

    return {
      id: row.phone_number,
      phone_number: row.phone_number,
      patient_name: nameByPhone.get(row.phone_number) ?? row.phone_number,
      status: convStatus,
      confidence_level: deriveConfidence(pausedReason),
      last_message_preview: preview,
      last_message_at: row.last_created_at,
      is_unread: false, // MVP: sin tracking de leídos
    }
  })

  // 7. Ordenar por urgencia, luego por last_message_at DESC
  conversations.sort(
    (a, b) =>
      URGENCY_ORDER[a.status] - URGENCY_ORDER[b.status] ||
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  )

  return Response.json({ conversations })
}
