import { QueryClient } from '@tanstack/react-query'

/**
 * QueryClient compartido por toda la app.
 * Se pasa a Refine vía options.reactQuery.clientConfig — Refine lo detecta
 * como instancia de QueryClient y lo reutiliza en su propio QueryClientProvider,
 * sin crear uno interno (ver @refinedev/core handleRefineOptions).
 *
 * Defaults:
 * - staleTime 60s: evita re-fetch innecesario al cambiar de pestaña/ventana.
 * - refetchOnWindowFocus false: el dashboard es monitoreo, no datos ultra-frescos.
 * - retry 1: un reintento antes de mostrar error al usuario.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
