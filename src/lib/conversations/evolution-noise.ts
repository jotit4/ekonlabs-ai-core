// Filtrado centralizado del ruido de infraestructura de Evolution API (Story 4.8).
//
// El ruido NO es un mensaje intercalado en hilos de pacientes — es una
// conversación/contacto propio: contacto "EvolutionAPI", phone_number '+123456',
// que repite el mensaje técnico de reconexión en cada handshake.
// (Confirmado vía Chatwoot API el 2026-06-04 + verificación read-only en Supabase.)
//
// Dos puntos de filtrado, un único helper:
//   (a) EXCLUIR '+123456' de la BANDEJA (/api/conversations)        → isEvolutionPhone
//   (b) OCULTAR el mensaje exacto en el HILO (messages/route.ts)    → filterEvolutionNoise
//
// El filtro vive 100% en el dashboard, NUNCA en el backend.
// Agregar variantes futuras (otro número o texto) = un cambio de una línea aquí.

import type { ChatwootMessage } from '@/types/conversations'

/**
 * Números de contactos de infraestructura de Evolution a excluir de la BANDEJA.
 * '+123456' = contacto "EvolutionAPI" (confirmado vía Chatwoot API 2026-06-04).
 */
export const EVOLUTION_API_PHONES: readonly string[] = ['+123456']

/**
 * Mensajes de ruido a ocultar en el HILO. Valor exacto confirmado (incluye el emoji 🚀).
 * Punto único para agregar variantes futuras (string para igualdad/includes, RegExp para patrón).
 */
export const EVOLUTION_NOISE_PATTERNS: readonly (string | RegExp)[] = [
  '🚀 Connection successfully established!',
]

/**
 * true si el phone_number corresponde a un contacto de infraestructura de Evolution.
 * Robusto a valores nulos/indefinidos.
 */
export function isEvolutionPhone(phone: string | null | undefined): boolean {
  if (!phone) return false
  return EVOLUTION_API_PHONES.includes(phone)
}

/**
 * true si el contenido del mensaje matchea alguno de los patrones de ruido de Evolution.
 * - string → coincidencia exacta o substring (includes)
 * - RegExp → .test
 * Robusto a content null/undefined → false. Inerte si la lista de patrones está vacía.
 */
export function isEvolutionNoise(content: string | null | undefined): boolean {
  if (!content) return false
  for (const pattern of EVOLUTION_NOISE_PATTERNS) {
    if (typeof pattern === 'string') {
      if (content === pattern || content.includes(pattern)) return true
    } else if (pattern.test(content)) {
      return true
    }
  }
  return false
}

/**
 * Filtra los mensajes del hilo eliminando los que sean ruido de Evolution.
 * No destructivo si EVOLUTION_NOISE_PATTERNS está vacío (devuelve la lista intacta).
 */
export function filterEvolutionNoise(messages: ChatwootMessage[]): ChatwootMessage[] {
  return messages.filter((m) => !isEvolutionNoise(m.content))
}
