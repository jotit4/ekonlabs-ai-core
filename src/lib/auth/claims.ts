import "server-only"
import { cache } from "react"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Locally-validated session claims.
 *
 * `role` is `app_role ?? role` and `tenantId` is `tenant_id`, extracted exactly
 * as the previous layout code did. `claims` is the raw JWT payload so callers
 * keep reading any additional claim (`app_role`, `full_name`, `email`, …) without
 * behavior changes.
 */
export interface AuthClaims {
  userId: string
  role: string | undefined
  tenantId: string | undefined
  claims: Record<string, unknown>
}

interface GetClaimsResult {
  data: { claims: Record<string, unknown> } | null
  error: unknown
}

interface AuthSurface {
  getClaims?: (jwt?: string) => Promise<GetClaimsResult>
  getUser: () => Promise<{ data: { user: { id: string; email?: unknown } | null }; error: unknown }>
}

/**
 * Resolve the current user's claims by validating the Supabase access token
 * **locally** — no per-request network round-trip to the Auth server.
 *
 * Production path (`supabase.auth.getClaims()`): the project signs JWTs with an
 * asymmetric key (ES256, published at `/.well-known/jwks.json`), so getClaims
 * verifies the signature + expiry against the in-process cached JWKS using
 * WebCrypto. The JWKS is fetched once per process (10 min TTL), not per request.
 *
 * Security trade-off (documented, intentional): local validation trusts a
 * signed, unexpired access token until its next refresh (~1h). The proxy uses
 * the same official `getClaims()` SSR path and persists refreshed cookies.
 * Access tokens are short-lived, so the revocation window is bounded.
 *
 * Compatibility fallback: when the Supabase client does not expose `getClaims`
 * (e.g. unit-test doubles that only stub `getUser`, or an older client), we fall
 * back to `getUser()` and derive the minimal claims (`sub`, `email`) from the
 * authenticated user. We intentionally do NOT read `getSession()` here: API
 * routes still parse role/tenant from their own session token, so touching the
 * session in this helper would double-consume `*Once` test mocks and change the
 * 401-vs-403 outcome. This branch never runs against a real
 * `@supabase/supabase-js` client in production.
 *
 * Returns `null` when the token is missing, malformed, expired or its signature
 * is invalid — callers treat `null` as "not authenticated" (401 / redirect),
 * identical to the previous `!user` check.
 *
 * Wrapped in React `cache()` so repeated calls within a single render/request
 * (e.g. layout + nested Server Components) do the work only once.
 */
export const getAuthClaims = cache(async (): Promise<AuthClaims | null> => {
  const supabase = await createSupabaseServerClient()
  const auth = supabase.auth as unknown as AuthSurface

  let claims: Record<string, unknown>

  if (typeof auth.getClaims === "function") {
    // Production: local signature + expiry verification (ES256 / JWKS).
    const { data, error } = await auth.getClaims()
    if (error || !data?.claims) return null
    claims = data.claims
  } else {
    // Fallback (test double / legacy client without getClaims): authenticate via
    // getUser and derive minimal claims from the user. Role/tenant come from the
    // route's own token parsing; the layout uses getClaims in production.
    const {
      data: { user },
      error,
    } = await auth.getUser()
    if (error || !user) return null
    claims = { sub: user.id }
    if (typeof user.email === "string") claims.email = user.email
  }

  const userId = typeof claims.sub === "string" ? claims.sub : undefined
  if (!userId) return null

  const role = (claims.app_role ?? claims.role) as string | undefined
  const tenantId = claims.tenant_id as string | undefined

  return { userId, role, tenantId, claims }
})
