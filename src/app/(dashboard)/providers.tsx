'use client'

import { useState } from 'react'
import { Refine } from '@refinedev/core'
import routerProvider from '@refinedev/nextjs-router'
import { dataProvider as supabaseDataProvider } from '@refinedev/supabase'
import { accessControlProvider } from '@/lib/refine/access-control'
import { fastapiDataProvider } from '@/lib/refine/providers'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

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
      options={{ syncWithLocation: true, warnWhenUnsavedChanges: false }}
    >
      {children}
    </Refine>
  )
}
