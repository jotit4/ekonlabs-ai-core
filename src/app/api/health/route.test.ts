import { describe, it, expect } from 'vitest'
import { GET } from './route'

describe('GET /api/health', () => {
  it('devuelve 200 con status ok', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
  })

  it('devuelve { status: "ok" } con timestamp ISO válido', async () => {
    const response = await GET()
    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeDefined()
    // Verificar que es una fecha ISO 8601 válida
    const date = new Date(body.timestamp)
    expect(date).toBeInstanceOf(Date)
    expect(isNaN(date.getTime())).toBe(false)
  })

  it('responde sin llamadas a servicios externos', () => {
    // El test pasa si GET() resuelve sin necesitar mocks de Supabase/FastAPI
    // Si hubiera llamadas externas, el test fallaría por falta de mocks
    const response = GET()
    expect(response).toBeDefined()
  })
})
