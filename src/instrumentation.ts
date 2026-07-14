/**
 * Instrumentation hook — warmup post-boot contra el cold-compile del primer request.
 *
 * En Next standalone (producción) los módulos de cada ruta se cargan de forma
 * lazy en el primer acceso: medido ~1,5s el primer hit de una ruta, ~80-200ms en
 * caliente. Como el contenedor sirve a pocos usuarios, ese primer hit lo pagaba
 * el usuario al entrar. Acá, apenas arranca el server, disparamos requests
 * internos best-effort a las rutas principales para compilarlas/cargarlas ANTES
 * de que entre nadie (un 401/redirect igual compila el módulo de la ruta).
 *
 * `register()` debe resolver antes de que el server acepte requests, y los fetches
 * apuntan a este mismo server → es fire-and-forget (setTimeout) para no bloquear
 * el boot ni deadlockear. Cualquier fallo (401, redirect, timeout) es inofensivo.
 */
export async function register() {
  // Solo runtime Node en producción — nunca en Edge ni en dev.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV !== 'production') return

  const port = process.env.PORT ?? '3000'
  const base = `http://127.0.0.1:${port}`
  const routes = [
    '/login',
    '/pacientes',
    '/agenda',
    '/conversaciones',
    '/metricas',
    '/inicio',
    '/api/conversations',
    '/api/patients',
  ]

  // Fire-and-forget: register() retorna al instante; el warmup corre cuando el
  // HTTP server ya está escuchando. Secuencial para no saturar los pocos vCPU del
  // VPS compilando todo a la vez.
  setTimeout(() => {
    void (async () => {
      for (const route of routes) {
        try {
          await fetch(`${base}${route}`, {
            redirect: 'manual',
            signal: AbortSignal.timeout(20_000),
          })
        } catch {
          // best-effort: un 401/redirect/timeout no debe afectar el arranque
        }
      }
    })()
  }, 2_000)
}
