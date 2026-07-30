import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/auth/claims'
import { DeletionRequestsPanel } from '@/components/configuracion/DeletionRequestsPanel'

export const dynamic = 'force-dynamic'

export default async function SupresionPage() {
  const auth = await getAuthClaims()
  if (!auth) redirect('/login')

  if (auth.role !== 'admin') {
    redirect('/agenda')
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm text-[var(--color-text-secondary)]">Configuración</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">
          Solicitudes de Supresión
        </h1>
      </header>
      <DeletionRequestsPanel />
    </section>
  )
}
