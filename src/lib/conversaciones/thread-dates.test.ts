import { describe, it, expect } from 'vitest'
import {
  dayKeyFromSeconds,
  isSameLocalDay,
  relativeDayLabel,
  shouldShowDateSeparator,
  deriveControllerName,
} from './thread-dates'
import type { ChatwootMessage } from '@/types/conversations'

// Helper: timestamp (en segundos) para una fecha local a mediodía (evita bordes de TZ)
const secondsAtLocalNoon = (y: number, m: number, d: number): number =>
  Math.floor(new Date(y, m - 1, d, 12, 0, 0).getTime() / 1000)

const makeMessage = (overrides: Partial<ChatwootMessage> = {}): ChatwootMessage => ({
  id: 1,
  content: 'msg',
  message_type: 0,
  created_at: secondsAtLocalNoon(2026, 5, 14),
  ...overrides,
})

describe('dayKeyFromSeconds', () => {
  it('produce clave YYYY-MM-DD local', () => {
    expect(dayKeyFromSeconds(secondsAtLocalNoon(2026, 5, 14))).toBe('2026-05-14')
  })
})

describe('isSameLocalDay', () => {
  it('true para dos timestamps del mismo día local', () => {
    const a = secondsAtLocalNoon(2026, 5, 14)
    const b = a + 3600 // misma fecha, +1h
    expect(isSameLocalDay(a, b)).toBe(true)
  })

  it('false para días distintos', () => {
    expect(
      isSameLocalDay(secondsAtLocalNoon(2026, 5, 14), secondsAtLocalNoon(2026, 5, 15)),
    ).toBe(false)
  })
})

describe('relativeDayLabel', () => {
  const now = new Date(2026, 4, 14, 15, 0, 0) // 14 de mayo 2026, local

  it('"Hoy" cuando el mensaje es del mismo día que now', () => {
    expect(relativeDayLabel(secondsAtLocalNoon(2026, 5, 14), now)).toBe('Hoy')
  })

  it('"Ayer" cuando el mensaje es del día anterior', () => {
    expect(relativeDayLabel(secondsAtLocalNoon(2026, 5, 13), now)).toBe('Ayer')
  })

  it('null para fechas más antiguas (el caller formatea fecha absoluta)', () => {
    expect(relativeDayLabel(secondsAtLocalNoon(2026, 5, 10), now)).toBeNull()
  })

  it('maneja el cruce de mes para "Ayer" (1 de junio → ayer = 31 de mayo)', () => {
    const firstOfJune = new Date(2026, 5, 1, 10, 0, 0)
    expect(relativeDayLabel(secondsAtLocalNoon(2026, 5, 31), firstOfJune)).toBe('Ayer')
  })
})

describe('shouldShowDateSeparator', () => {
  it('true para el primer mensaje del hilo (sin previo)', () => {
    expect(shouldShowDateSeparator(makeMessage(), undefined)).toBe(true)
  })

  it('false cuando el mensaje previo es del mismo día', () => {
    const prev = makeMessage({ id: 1, created_at: secondsAtLocalNoon(2026, 5, 14) })
    const curr = makeMessage({ id: 2, created_at: secondsAtLocalNoon(2026, 5, 14) + 7200 })
    expect(shouldShowDateSeparator(curr, prev)).toBe(false)
  })

  it('true cuando el mensaje previo es de otro día', () => {
    const prev = makeMessage({ id: 1, created_at: secondsAtLocalNoon(2026, 5, 14) })
    const curr = makeMessage({ id: 2, created_at: secondsAtLocalNoon(2026, 5, 15) })
    expect(shouldShowDateSeparator(curr, prev)).toBe(true)
  })

  it('false para separadores de actividad (message_type 2) — no abren día', () => {
    const prev = makeMessage({ id: 1, created_at: secondsAtLocalNoon(2026, 5, 14) })
    const activity = makeMessage({
      id: 2,
      message_type: 2,
      content: 'tomó control',
      created_at: secondsAtLocalNoon(2026, 5, 15),
    })
    expect(shouldShowDateSeparator(activity, prev)).toBe(false)
  })
})

describe('deriveControllerName', () => {
  it('devuelve el nombre del último mensaje humano (meta.agent.name)', () => {
    const messages: ChatwootMessage[] = [
      makeMessage({ id: 1, message_type: 0, content: 'hola' }),
      makeMessage({
        id: 2,
        message_type: 1,
        sender: { name: 'val', type: 'agent' },
        meta: { agent: { name: 'Valentina' } },
      }),
    ]
    expect(deriveControllerName(messages)).toBe('Valentina')
  })

  it('cae a sender.name cuando no hay meta.agent.name', () => {
    const messages: ChatwootMessage[] = [
      makeMessage({ id: 1, message_type: 1, sender: { name: 'Carla', type: 'agent' } }),
    ]
    expect(deriveControllerName(messages)).toBe('Carla')
  })

  it('ignora mensajes del bot (sender.type agent_bot)', () => {
    const messages: ChatwootMessage[] = [
      makeMessage({ id: 1, message_type: 1, sender: { name: 'bot', type: 'agent_bot' } }),
      makeMessage({ id: 2, message_type: 0, content: 'pregunta' }),
    ]
    expect(deriveControllerName(messages)).toBeNull()
  })

  it('toma el ÚLTIMO humano cuando hay varios', () => {
    const messages: ChatwootMessage[] = [
      makeMessage({ id: 1, message_type: 1, sender: { name: 'Ana', type: 'agent' } }),
      makeMessage({ id: 2, message_type: 0, content: 'ok' }),
      makeMessage({ id: 3, message_type: 1, sender: { name: 'Beto', type: 'agent' } }),
    ]
    expect(deriveControllerName(messages)).toBe('Beto')
  })

  it('null cuando no hay mensajes humanos', () => {
    expect(deriveControllerName([makeMessage({ message_type: 0 })])).toBeNull()
    expect(deriveControllerName([])).toBeNull()
  })
})
