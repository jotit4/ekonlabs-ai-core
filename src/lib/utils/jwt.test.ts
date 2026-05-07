import { describe, it, expect } from 'vitest'
import { parseJwtPayload } from './jwt'

function makeJwt(payload: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `header.${encoded}.signature`
}

describe('parseJwtPayload', () => {
  it('decodifica payload válido', () => {
    const jwt = makeJwt({ tenant_id: 'abc-123', role: 'admin' })
    const result = parseJwtPayload(jwt)
    expect(result?.tenant_id).toBe('abc-123')
    expect(result?.role).toBe('admin')
  })

  it('maneja base64url encoding (guiones y guiones bajos)', () => {
    const jwt = makeJwt({ sub: 'user-1', tenant_id: 'uuid-value', role: 'receptionist' })
    const result = parseJwtPayload(jwt)
    expect(result?.role).toBe('receptionist')
  })

  it('retorna null para token sin tres partes', () => {
    expect(parseJwtPayload('not-a-jwt')).toBeNull()
  })

  it('retorna null para string vacío', () => {
    expect(parseJwtPayload('')).toBeNull()
  })

  it('retorna null si el payload no es JSON válido', () => {
    expect(parseJwtPayload('h.bm90anNvbg.s')).toBeNull()
  })
})
