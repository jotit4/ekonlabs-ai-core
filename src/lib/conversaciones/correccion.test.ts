import { describe, it, expect } from 'vitest'
import {
  buildCorreccionContent,
  cleanPatientQuestion,
  findPreviousPatientMessage,
  MAX_PATIENT_QUESTION_CHARS,
} from './correccion'
import type { ChatwootMessage } from '@/types/conversations'

const makeMessage = (overrides: Partial<ChatwootMessage> = {}): ChatwootMessage => ({
  id: 1,
  content: 'msg',
  message_type: 0,
  created_at: 1715000000,
  ...overrides,
})

describe('cleanPatientQuestion', () => {
  it('remueve el prefijo [audio_transcription]: y hace trim', () => {
    expect(cleanPatientQuestion('[audio_transcription]:  Quiero un turno  ')).toBe(
      'Quiero un turno',
    )
  })

  it('deja el texto intacto si no hay prefijo de audio', () => {
    expect(cleanPatientQuestion('  Hola  ')).toBe('Hola')
  })

  it('trunca a 500 chars', () => {
    const long = 'a'.repeat(600)
    expect(cleanPatientQuestion(long).length).toBe(MAX_PATIENT_QUESTION_CHARS)
  })
})

describe('buildCorreccionContent', () => {
  it('compone formato Consulta → Respuesta cuando hay pregunta', () => {
    const content = buildCorreccionContent({
      patientQuestion: '¿Atienden OSEP?',
      correctAnswer: 'Sí, atendemos OSEP con autorización previa.',
    })
    expect(content).toBe(
      'Consulta del paciente: "¿Atienden OSEP?"\nRespuesta correcta: Sí, atendemos OSEP con autorización previa.',
    )
  })

  it('omite la consulta cuando patientQuestion es null', () => {
    const content = buildCorreccionContent({
      patientQuestion: null,
      correctAnswer: 'Respuesta suelta',
    })
    expect(content).toBe('Respuesta correcta: Respuesta suelta')
  })

  it('omite la consulta cuando patientQuestion queda vacía tras limpiar', () => {
    const content = buildCorreccionContent({
      patientQuestion: '[audio_transcription]:   ',
      correctAnswer: 'Resp',
    })
    expect(content).toBe('Respuesta correcta: Resp')
  })

  it('limpia el prefijo de audio de la pregunta', () => {
    const content = buildCorreccionContent({
      patientQuestion: '[audio_transcription]: Quiero turno',
      correctAnswer: 'Claro',
    })
    expect(content).toBe('Consulta del paciente: "Quiero turno"\nRespuesta correcta: Claro')
  })

  it('trunca preguntas mayores a 500 chars', () => {
    const long = 'b'.repeat(600)
    const content = buildCorreccionContent({ patientQuestion: long, correctAnswer: 'x' })
    expect(content).toContain('b'.repeat(500))
    expect(content).not.toContain('b'.repeat(501))
  })

  it('hace trim de la respuesta', () => {
    const content = buildCorreccionContent({
      patientQuestion: null,
      correctAnswer: '   espacios   ',
    })
    expect(content).toBe('Respuesta correcta: espacios')
  })
})

describe('findPreviousPatientMessage', () => {
  it('devuelve el content del paciente inmediatamente anterior', () => {
    const messages = [
      makeMessage({ id: 1, message_type: 0, content: 'Hola' }),
      makeMessage({ id: 2, message_type: 0, content: '¿Atienden OSEP?' }),
      makeMessage({ id: 3, message_type: 1, content: 'No sé' }),
    ]
    expect(findPreviousPatientMessage(messages, 3)).toBe('¿Atienden OSEP?')
  })

  it('ignora separadores (type 2) y salientes (type 1) intermedios', () => {
    const messages = [
      makeMessage({ id: 1, message_type: 0, content: 'Pregunta real' }),
      makeMessage({ id: 2, message_type: 2, content: 'Valentina tomó control' }),
      makeMessage({ id: 3, message_type: 1, content: 'respuesta intermedia' }),
      makeMessage({ id: 4, message_type: 1, content: 'respuesta a corregir' }),
    ]
    expect(findPreviousPatientMessage(messages, 4)).toBe('Pregunta real')
  })

  it('devuelve null si no hay paciente previo', () => {
    const messages = [
      makeMessage({ id: 1, message_type: 2, content: 'inicio' }),
      makeMessage({ id: 2, message_type: 1, content: 'agente abrió' }),
    ]
    expect(findPreviousPatientMessage(messages, 2)).toBeNull()
  })

  it('devuelve null si el mensaje del agente no existe', () => {
    const messages = [makeMessage({ id: 1, message_type: 0, content: 'x' })]
    expect(findPreviousPatientMessage(messages, 999)).toBeNull()
  })
})
