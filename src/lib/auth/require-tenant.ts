export function requireTenantId(
  claims: Record<string, unknown> | null | undefined,
): { tenantId: string } | Response {
  const tenantId = claims?.tenant_id
  if (typeof tenantId === 'string' && tenantId.trim().length > 0) {
    return { tenantId: tenantId.trim() }
  }

  return Response.json({ error: 'tenant_required' }, { status: 403 })
}
