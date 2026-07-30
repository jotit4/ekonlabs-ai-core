import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/auth/claims'
import { PromptHistoryView } from '@/components/configuracion/PromptHistoryView'

export const dynamic = 'force-dynamic'

export default async function HistorialPage() {
  const auth = await getAuthClaims()
  if (!auth) redirect('/login')

  if (auth.role !== 'admin') {
    redirect('/agenda')
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm text-[var(--color-text-secondary)]">Configuración / Agente IA</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Historial de cambios</h1>
      </header>
      <PromptHistoryView />
    </section>
  )
}
