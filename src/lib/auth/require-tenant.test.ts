import { describe, expect, it } from 'vitest'
import { requireTenantId } from './require-tenant'

describe('requireTenantId', () => {
  it('devuelve el tenant_id no vacío', () => {
    expect(requireTenantId({ tenant_id: 'tenant-1' })).toEqual({ tenantId: 'tenant-1' })
  })

  it.each([undefined, null, '', '   ', 123])('devuelve 403 tenant_required para %j', async (tenantId) => {
    const response = requireTenantId({ tenant_id: tenantId })
    expect(response).toBeInstanceOf(Response)
    const errorResponse = response as Response
    expect(errorResponse.status).toBe(403)
    await expect(errorResponse.json()).resolves.toEqual({ error: 'tenant_required' })
  })
})
