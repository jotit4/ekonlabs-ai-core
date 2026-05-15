import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { AuditLogView } from '@/components/configuracion/AuditLogView'
import { RetentionStatusPanel } from '@/components/configuracion/RetentionStatusPanel'
import { Separator } from '@/components/ui/separator'

export const dynamic = 'force-dynamic'

export default async function AuditoriaPage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')

  if (claims?.app_role !== 'admin') {
    redirect('/agenda')
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm text-[var(--color-text-secondary)]">Configuración</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">
          Auditoría
        </h1>
      </header>
      <AuditLogView />
      <Separator className="my-8" />
      <RetentionStatusPanel />
    </section>
  )
}
