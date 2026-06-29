'use client'

import { useState } from 'react'
import { Refine } from '@refinedev/core'
import routerProvider from '@refinedev/nextjs-router'
import { dataProvider as supabaseDataProvider } from '@refinedev/supabase'
import { accessControlProvider } from '@/lib/refine/access-control'
import { fastapiDataProvider } from '@/lib/refine/providers'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { queryClient } from '@/lib/query-client'

export function DashboardProviders({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createSupabaseBrowserClient())

  return (
    <Refine
      routerProvider={routerProvider}
      dataProvider={{
        default: supabaseDataProvider(supabase),
        fastapi: fastapiDataProvider,
      }}
      accessControlProvider={accessControlProvider}
      options={{
        syncWithLocation: true,
        warnWhenUnsavedChanges: false,
        disableTelemetry: true,
        // Pasamos nuestro QueryClient propio: Refine lo detecta como instancia
        // y lo usa directamente en su QueryClientProvider (no crea uno interno).
        // Defaults: staleTime 60s, refetchOnWindowFocus false, retry 1.
        reactQuery: { clientConfig: queryClient },
      }}
    >
      {children}
    </Refine>
  )
}
