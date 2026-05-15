import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { ConversationSummary, ConversationStatus, ConfidenceLevel } from '@/types/conversations'

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

  // 2. Obtener thread_states activas del tenant (RLS filtra por tenant_id automáticamente)
  // NO agregar .eq('tenant_id', ...) — AR14
  const { data: threadStates, error: tsError } = await supabase
    .from('thread_states')
    .select('phone_number, status, paused_reason, updated_at')
    .order('updated_at', { ascending: false })

  if (tsError) {
    console.error('[conversations/GET] thread_states error:', tsError)
    return Response.json({ error: 'Error al obtener conversaciones' }, { status: 500 })
  }

  if (!threadStates?.length) {
    return Response.json({ conversations: [] })
  }

  const phoneNumbers = threadStates.map((ts) => ts.phone_number)

  // 3. Obtener el último mensaje de conversations por phone_number
  // La RPC usa DISTINCT ON para retornar exactamente 1 fila por número (fix C-13)
  const { data: lastMessages, error: convError } = await supabase
    .rpc('get_latest_messages_by_phone', { phone_numbers: phoneNumbers })

  if (convError) {
    console.error('[conversations/GET] conversations error:', convError)
    return Response.json({ error: 'Error al obtener mensajes' }, { status: 500 })
  }

  // 4. Obtener nombres de pacientes por phone_number
  const { data: patients } = await supabase
    .from('patients')
    .select('phone_number, full_name')
    .in('phone_number', phoneNumbers)

  // 5. Construir mapas auxiliares
  const lastMessageByPhone = new Map<string, { phone_number: string; content: string; created_at: string }>()
  for (const msg of lastMessages ?? []) {
    if (!lastMessageByPhone.has(msg.phone_number)) {
      lastMessageByPhone.set(msg.phone_number, msg)
    }
  }

  const nameByPhone = new Map<string, string>(
    (patients ?? []).map((p) => [p.phone_number, p.full_name])
  )

  // 6. Construir ConversationSummary[]
  const conversations: ConversationSummary[] = threadStates.map((ts) => {
    const lastMsg = lastMessageByPhone.get(ts.phone_number)
    const convStatus = deriveStatus(ts.status, ts.paused_reason)
    const preview = lastMsg?.content?.slice(0, 80) ?? ''

    return {
      id: ts.phone_number,
      phone_number: ts.phone_number,
      patient_name: nameByPhone.get(ts.phone_number) ?? ts.phone_number,
      status: convStatus,
      confidence_level: deriveConfidence(ts.paused_reason),
      last_message_preview: preview,
      last_message_at: lastMsg?.created_at ?? ts.updated_at,
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
