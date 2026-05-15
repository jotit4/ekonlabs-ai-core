import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { PromptHistoryView } from '@/components/configuracion/PromptHistoryView'

export const dynamic = 'force-dynamic'

export default async function HistorialPage() {
  const supabase = await createSupabaseServerClient()

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
        <p className="text-sm text-[var(--color-text-secondary)]">Configuración / Agente IA</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Historial de cambios</h1>
      </header>
      <PromptHistoryView />
    </section>
  )
}
