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
  /** Intent detectado: "agendar_turno" | "cancelar_turno" | "consultar_disponibilidad" | etc. */
  detected_intent?: string | null
  /** DNI capturado del paciente */
  dni?: string | null
  /** Servicio solicitado: ej "Kinesiología", "Fisioterapia" */
  service_requested?: string | null
  /** ISO datetime del slot solicitado, ej "2026-05-15T10:00:00" */
  slot_requested?: string | null
  /** Texto libre sobre disponibilidad cuando no hay slot específico */
  availability_info?: string | null
  /** Obra social: ej "OSDE", "Swiss Medical" */
  obra_social?: string | null
  /** Razón del bloqueo actual si aplica */
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
