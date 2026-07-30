import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/auth/claims'
import { MetricasClientWrapper } from '@/components/metricas/MetricasClientWrapper'

export const dynamic = 'force-dynamic'

export default async function MetricasPage() {
  const auth = await getAuthClaims()
  if (!auth) redirect('/login')

  if (auth.role !== 'admin') {
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
