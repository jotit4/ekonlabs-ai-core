import "server-only"

/**
 * Global keep-alive dispatcher for outbound `fetch` (undici, the engine behind
 * Node's built-in fetch).
 *
 * Why: every server → Supabase call (Auth JWKS discovery, token refresh via the
 * proxy, and PostgREST/RLS queries) goes out over `fetch`. Node keeps sockets
 * alive by default, but with a short idle timeout (~4s). Under bursty/idle
 * dashboard traffic that timeout expired between requests, forcing a full TLS
 * re-handshake (~390ms spikes observed in production). Extending the idle
 * keep-alive window lets warm TLS sessions survive between requests so we pay the
 * handshake once, not per request.
 *
 * Best-effort: if undici is unavailable (e.g. the Edge runtime — the proxy never
 * imports this module) we silently keep Node's default behavior. This is only an
 * optimization and must never be fatal.
 *
 * Node-runtime only. Imported for its side effect by the Node Supabase clients
 * (`server.ts`, `admin.ts`); it is never pulled into the Edge middleware/proxy.
 */
let configured = false

async function configureKeepAlive(): Promise<void> {
  if (configured) return
  configured = true
  try {
    const { setGlobalDispatcher, Agent } = await import("undici")
    setGlobalDispatcher(
      new Agent({
        // Keep idle sockets around long enough to survive between navigations
        // and periodic auth checks (was the ~4s default that caused re-TLS).
        keepAliveTimeout: 60_000, // 60s idle
        keepAliveMaxTimeout: 600_000, // 10 min hard cap
        connections: 128, // pooled connections per origin
      }),
    )
  } catch {
    // undici not resolvable in this runtime — leave global fetch untouched.
  }
}

void configureKeepAlive()

export {}
