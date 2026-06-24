// Helpers para agrupar mensajes por fecha y derivar separadores de día.
//
// `created_at` de ChatwootMessage está en SEGUNDOS (UNIX) — multiplicar por 1000.
//
// La decisión de "¿este mensaje arranca un día nuevo?" se calcula con Date nativo
// (no con date-fns) para que NO dependa del mock global de `date-fns` que usan los
// tests de componentes (que mockean `format` a un valor fijo). Solo el label de
// fecha absoluta ("14 de mayo") usa date-fns/format en el componente.

import type { ChatwootMessage } from '@/types/conversations'

/** Clave de día local "YYYY-MM-DD" a partir de un timestamp en segundos. */
export function dayKeyFromSeconds(createdAtSeconds: number): string {
  const d = new Date(createdAtSeconds * 1000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** true si dos timestamps (en segundos) caen el mismo día local. */
export function isSameLocalDay(aSeconds: number, bSeconds: number): boolean {
  return dayKeyFromSeconds(aSeconds) === dayKeyFromSeconds(bSeconds)
}

/**
 * Etiqueta relativa de día: "Hoy" / "Ayer" / null (cuando no aplica → el
 * componente formatea la fecha absoluta con date-fns).
 * `now` inyectable para tests deterministas.
 */
export function relativeDayLabel(
  createdAtSeconds: number,
  now: Date = new Date(),
): 'Hoy' | 'Ayer' | null {
  const msgKey = dayKeyFromSeconds(createdAtSeconds)

  const todayKey = dayKeyFromSeconds(Math.floor(now.getTime() / 1000))
  if (msgKey === todayKey) return 'Hoy'

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = dayKeyFromSeconds(Math.floor(yesterday.getTime() / 1000))
  if (msgKey === yesterdayKey) return 'Ayer'

  return null
}

/**
 * Decide si hay que pintar un separador de fecha ANTES de `message`, comparando
 * con el mensaje previo de la lista. Los separadores de actividad (type 2) no
 * cuentan como "día previo" — se ignoran para la comparación de fecha porque
 * representan eventos, no mensajes con marca temporal relevante para el grupo.
 *
 * Devuelve true para el primer mensaje no-actividad de cada día.
 */
export function shouldShowDateSeparator(
  message: ChatwootMessage,
  previousMessage: ChatwootMessage | undefined,
): boolean {
  if (message.message_type === 2) return false // las actividades no abren día
  if (!previousMessage) return true // primer mensaje del hilo
  return !isSameLocalDay(message.created_at, previousMessage.created_at)
}

/**
 * Deriva el nombre del humano que tiene el control de la conversación a partir
 * del hilo de mensajes: el último mensaje saliente de un agente humano
 * (message_type === 1 && sender.type === 'agent') lleva el nombre del operador
 * en meta.agent.name ?? sender.name.
 *
 * Fuente elegida por ser la única disponible client-side hoy:
 * - thread_states NO guarda quién tomó el control (solo status/paused_reason).
 * - audit_logs guarda user_id pero es admin-only (RLS) y sin nombre.
 * - el endpoint de takeover solo expone controlled_by en el 409 (conflicto).
 *
 * Limitación: solo hay nombre una vez que el humano envió al menos un mensaje.
 * Antes de eso devuelve null y el caller cae al nombre del usuario actual.
 */
export function deriveControllerName(messages: ChatwootMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.message_type === 1 && m.sender?.type === 'agent') {
      return m.meta?.agent?.name ?? m.sender?.name ?? null
    }
  }
  return null
}
