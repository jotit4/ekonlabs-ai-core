// Helpers puros para la corrección del agente desde la bandeja (Story 6.8).
// Sin dependencias de React/DOM — testeables aislados.

import type { ChatwootMessage } from '@/types/conversations'

const AUDIO_PREFIX = '[audio_transcription]:'

/** Máximo de chars de la "pregunta del paciente" anclada en el `content`. */
export const MAX_PATIENT_QUESTION_CHARS = 500

/**
 * Limpia el texto de un mensaje del paciente para usarlo como "pregunta":
 * remueve el prefijo `[audio_transcription]:`, hace trim y trunca a ≤500 chars.
 */
export function cleanPatientQuestion(raw: string): string {
  let q = raw
  if (q.startsWith(AUDIO_PREFIX)) {
    q = q.slice(AUDIO_PREFIX.length)
  }
  q = q.trim()
  if (q.length > MAX_PATIENT_QUESTION_CHARS) {
    q = q.slice(0, MAX_PATIENT_QUESTION_CHARS).trim()
  }
  return q
}

/**
 * Recorre `messages` hacia atrás desde el mensaje del agente identificado por
 * `agentMessageId` y devuelve el `content` del primer mensaje del paciente
 * (`message_type === 0`) inmediatamente anterior. Ignora separadores
 * (`message_type === 2`) y otros mensajes salientes. `null` si no hay ninguno.
 */
export function findPreviousPatientMessage(
  messages: ChatwootMessage[],
  agentMessageId: number,
): string | null {
  const idx = messages.findIndex((m) => m.id === agentMessageId)
  if (idx === -1) return null
  for (let i = idx - 1; i >= 0; i--) {
    if (messages[i].message_type === 0) {
      return messages[i].content
    }
  }
  return null
}

/**
 * Compone el `content` de la entrada de KB para una corrección, anclando la
 * pregunta del paciente para maximizar el match del RAG (ver story 6.8).
 *
 * Con pregunta:
 *   Consulta del paciente: "<q audio-cleaned, ≤500 chars>"
 *   Respuesta correcta: <a trim>
 * Sin pregunta (null/vacía):
 *   Respuesta correcta: <a trim>
 */
export function buildCorreccionContent({
  patientQuestion,
  correctAnswer,
}: {
  patientQuestion: string | null
  correctAnswer: string
}): string {
  const answer = correctAnswer.trim()
  const cleaned = patientQuestion ? cleanPatientQuestion(patientQuestion) : ''
  if (cleaned) {
    return `Consulta del paciente: "${cleaned}"\nRespuesta correcta: ${answer}`
  }
  return `Respuesta correcta: ${answer}`
}
