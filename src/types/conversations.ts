// Tipos del módulo de Conversaciones IA (Epic 4)

export type ConversationStatus = 'ai_active' | 'needs_intervention' | 'resolved' | 'human_takeover'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface ConversationSummary {
  /** phone_number usado como ID único de conversación en MVP */
  id: string
  phone_number: string
  /** full_name del paciente o phone_number si no hay match */
  patient_name: string
  status: ConversationStatus
  confidence_level: ConfidenceLevel
  /** Primeros 80 chars del último mensaje */
  last_message_preview: string
  /** ISO timestamp para ordenar y formatear */
  last_message_at: string
  /** MVP: siempre false (sin tracking de leídos) */
  is_unread: boolean
}

export interface ChatwootMessage {
  id: number
  content: string
  /** 0=incoming (paciente), 1=outgoing (bot/agente), 2=activity/separador */
  message_type: number
  /** UNIX timestamp en SEGUNDOS — multiplicar por 1000 para Date */
  created_at: number
  sender?: {
    name: string
    /** 'contact' | 'agent_bot' | 'agent' */
    type?: string
  }
  meta?: {
    agent?: {
      name: string
    }
  }
  attachments?: Array<{
    id: number
    file_type: 'audio' | 'image' | 'file' | 'video' | string
    file_url: string
    data_url?: string
    thumb_url?: string
    extension?: string
  }>
}

export interface AgentContext {
  patient_name?: string | null
  phone_number?: string | null
  /**
   * Intención detectada EN VIVO por el agente, ya legible:
   * "Sacar un turno" | "Cancelar un turno" | "Consulta informativa" | etc.
   * Cae a "Turno confirmado" si solo hay un turno persistido y no contexto vivo.
   */
  detected_intent?: string | null
  /** DNI capturado en la conversación (vivo) o el del paciente persistido */
  dni?: string | null
  /** Servicio en negociación (vivo) o el del último turno confirmado */
  service_requested?: string | null
  /**
   * Slot que el agente está negociando AHORA (fecha YYYY-MM-DD o ISO datetime),
   * NO necesariamente el turno confirmado. Cae al start_at del último turno
   * confirmado si la conversación ya cerró sin contexto vivo.
   */
  slot_requested?: string | null
  /** Texto libre sobre disponibilidad cuando no hay slot específico */
  availability_info?: string | null
  /** Obra social capturada (vivo) o la del paciente persistido: ej "OSDE", "Swiss Medical" */
  obra_social?: string | null
  /**
   * Bloqueo / paso actual del flujo. Si el hilo está pausado muestra la razón de
   * pausa; si no, el paso vivo del agente ("Ofreciendo horarios", etc.).
   */
  current_block?: string | null
  /** true si la conversación está resuelta */
  is_resolved?: boolean
}

export interface TakeoverResponse {
  status: 'ok'
}

export interface TakeoverConflictResponse {
  error: 'conflict'
  controlled_by?: string
}

export interface SendMessageResponse {
  status: 'ok'
}

export interface ReleaseResponse {
  status: 'ok'
}
