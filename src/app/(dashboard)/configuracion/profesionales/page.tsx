import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/auth/claims'
import { ProfesionalesView } from '@/components/configuracion/ProfesionalesView'

export const dynamic = 'force-dynamic'

export default async function ProfesionalesPage() {
  const auth = await getAuthClaims()
  if (!auth) redirect('/login')

  const role = auth.role
  if (role !== 'admin' && role !== 'receptionist') {
    redirect('/agenda')
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm text-[var(--color-text-secondary)]">Configuración</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Profesionales</h1>
      </header>
      <ProfesionalesView />
    </section>
  )
}
