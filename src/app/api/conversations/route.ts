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

interface ConversationReadRow {
  phone_number: string
  last_read_at: string
}

interface ConversationResolutionRow {
  phone_number: string
  resolved_at: string | null
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

  // Check de rol: los tres roles operativos (admin, doctor, receptionist) ven la
  // bandeja de conversaciones IA. La recepcionista es el usuario PRIMARIO del módulo
  // — es "el humano" del human-takeover (su tour `receptionist-conversaciones` es el
  // journey más crítico). El allowlist explícito se mantiene como defensa ante roles
  // futuros que no deban ver conversaciones de pacientes.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  const appRole = claims?.app_role as string | undefined
  if (!['admin', 'doctor', 'receptionist'].includes(appRole ?? '')) {
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
  // 4. Obtener reads del usuario actual (RLS filtra a user_id = auth.uid())
  // 5. Obtener resoluciones del tenant (RLS filtra por tenant)
  const [patientsResult, readsResult, resolutionsResult] = await Promise.all([
    supabase
      .from('patients')
      .select('phone_number, full_name')
      .in('phone_number', phoneNumbers),
    supabase
      .from('conversation_reads')
      .select('phone_number, last_read_at')
      .in('phone_number', phoneNumbers),
    supabase
      .from('conversation_resolutions')
      .select('phone_number, resolved_at')
      .in('phone_number', phoneNumbers),
  ])

  const nameByPhone = new Map<string, string>(
    (patientsResult.data ?? []).map((p) => [p.phone_number, p.full_name])
  )

  const readByPhone = new Map<string, string>(
    (readsResult.data ?? [] as ConversationReadRow[]).map((r: ConversationReadRow) => [r.phone_number, r.last_read_at])
  )

  const resolvedByPhone = new Map<string, string | null>(
    (resolutionsResult.data ?? [] as ConversationResolutionRow[]).map((r: ConversationResolutionRow) => [r.phone_number, r.resolved_at])
  )

  // 6. Construir ConversationSummary[].
  const conversations: ConversationSummary[] = visibleRows.map((row) => {
    const status = row.ts_status ?? 'active'
    const pausedReason = row.ts_paused_reason ?? null
    let convStatus = deriveStatus(status, pausedReason)
    const preview = row.last_content?.slice(0, 80) ?? ''

    // B2: override de status a 'resolved' si la resolución existe y no llegó
    // un mensaje posterior (auto-reabre al llegar nuevo mensaje del paciente).
    const resolvedAt = resolvedByPhone.get(row.phone_number)
    if (
      resolvedAt != null &&
      resolvedAt !== '' &&
      new Date(row.last_created_at).getTime() <= new Date(resolvedAt).getTime()
    ) {
      convStatus = 'resolved'
    }

    // B1: is_unread = último mensaje es del paciente AND
    //     (no hay registro de lectura O la lectura es anterior al último mensaje)
    const lastReadAt = readByPhone.get(row.phone_number)
    const isUnread =
      row.last_role === 'user' &&
      (lastReadAt === undefined ||
        new Date(row.last_created_at).getTime() > new Date(lastReadAt).getTime())

    return {
      id: row.phone_number,
      phone_number: row.phone_number,
      patient_name: nameByPhone.get(row.phone_number) ?? row.phone_number,
      status: convStatus,
      confidence_level: deriveConfidence(pausedReason),
      last_message_preview: preview,
      last_message_at: row.last_created_at,
      is_unread: isUnread,
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
