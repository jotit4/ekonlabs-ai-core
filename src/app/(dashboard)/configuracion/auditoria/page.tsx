import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/auth/claims'
import { AuditLogView } from '@/components/configuracion/AuditLogView'
import { RetentionStatusPanel } from '@/components/configuracion/RetentionStatusPanel'
import { Separator } from '@/components/ui/separator'

export const dynamic = 'force-dynamic'

export default async function AuditoriaPage() {
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
          Auditoría
        </h1>
      </header>
      <AuditLogView />
      <Separator className="my-8" />
      <RetentionStatusPanel />
    </section>
  )
}
