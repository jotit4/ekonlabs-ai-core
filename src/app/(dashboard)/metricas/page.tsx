import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { MetricasClientWrapper } from '@/components/metricas/MetricasClientWrapper'

export const dynamic = 'force-dynamic'

export default async function MetricasPage() {
  const supabase = await createSupabaseServerClient()

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')

  if (claims?.app_role !== 'admin') {
    redirect('/agenda')
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm text-[var(--color-text-secondary)]">Dashboard</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Métricas</h1>
      </header>
      <Suspense fallback={<div>Cargando métricas...</div>}>
        <MetricasClientWrapper />
      </Suspense>
    </section>
  )
}
