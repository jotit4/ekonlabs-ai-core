import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/auth/claims'
import { MiDisponibilidadView } from '@/components/mi-disponibilidad/MiDisponibilidadView'

export const dynamic = 'force-dynamic'

export default async function MiDisponibilidadPage() {
  const auth = await getAuthClaims()
  if (!auth) redirect('/login')

  if (auth.role !== 'doctor') {
    redirect('/agenda')
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm text-[var(--color-text-secondary)]">Mi cuenta</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Mi Disponibilidad</h1>
      </header>
      <MiDisponibilidadView />
    </section>
  )
}
