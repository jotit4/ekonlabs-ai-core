import { describe, it, expect } from 'vitest'
import type { ChatwootMessage } from '@/types/conversations'
import {
  EVOLUTION_API_PHONES,
  EVOLUTION_NOISE_PATTERNS,
  isEvolutionPhone,
  isEvolutionNoise,
  filterEvolutionNoise,
} from './evolution-noise'

const NOISE_TEXT = '🚀 Connection successfully established!'

function msg(id: number, content: string): ChatwootMessage {
  return { id, content, message_type: 1, created_at: 1715000000 + id }
}

describe('evolution-noise', () => {
  describe('constantes centralizadas', () => {
    it('EVOLUTION_API_PHONES incluye +123456', () => {
      expect(EVOLUTION_API_PHONES).toContain('+123456')
    })

    it('EVOLUTION_NOISE_PATTERNS incluye el mensaje exacto de conexión', () => {
      expect(EVOLUTION_NOISE_PATTERNS).toContain(NOISE_TEXT)
    })
  })

  describe('isEvolutionPhone', () => {
    it('true para +123456 (contacto EvolutionAPI)', () => {
      expect(isEvolutionPhone('+123456')).toBe(true)
    })

    it('false para un número legítimo de paciente', () => {
      expect(isEvolutionPhone('+5492617198342')).toBe(false)
    })

    it('robustez: null/undefined/vacío → false', () => {
      expect(isEvolutionPhone(null)).toBe(false)
      expect(isEvolutionPhone(undefined)).toBe(false)
      expect(isEvolutionPhone('')).toBe(false)
    })
  })

  describe('isEvolutionNoise', () => {
    it('true para el mensaje exacto de conexión de Evolution', () => {
      expect(isEvolutionNoise(NOISE_TEXT)).toBe(true)
    })

    it('false para un mensaje real de paciente', () => {
      expect(isEvolutionNoise('Hola, quiero sacar un turno para el martes')).toBe(false)
    })

    it('robustez: content null/undefined/vacío no rompe (retorna false)', () => {
      expect(isEvolutionNoise(null)).toBe(false)
      expect(isEvolutionNoise(undefined)).toBe(false)
      expect(isEvolutionNoise('')).toBe(false)
    })
  })

  describe('filterEvolutionNoise', () => {
    it('elimina exactamente el mensaje de Evolution y conserva el resto', () => {
      const messages = [
        msg(1, 'Hola, buenas tardes'),
        msg(2, NOISE_TEXT),
        msg(3, '¿Tienen turno para mañana?'),
      ]

      const result = filterEvolutionNoise(messages)

      expect(result).toHaveLength(2)
      expect(result.map((m) => m.id)).toEqual([1, 3])
      expect(result.some((m) => m.content === NOISE_TEXT)).toBe(false)
    })

    it('no rompe con mensajes de content vacío/undefined', () => {
      const messages = [
        msg(1, ''),
        { id: 2, content: undefined as unknown as string, message_type: 1, created_at: 1715000002 },
        msg(3, 'Mensaje válido'),
      ]

      const result = filterEvolutionNoise(messages)

      // ninguno es ruido de Evolution → se conservan todos
      expect(result).toHaveLength(3)
    })

    it('lista sin ruido se devuelve intacta', () => {
      const messages = [msg(1, 'A'), msg(2, 'B')]
      expect(filterEvolutionNoise(messages)).toHaveLength(2)
    })
  })
})
