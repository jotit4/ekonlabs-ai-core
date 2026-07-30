import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/auth/claims'
import { MiPerfilView } from '@/components/mi-perfil/MiPerfilView'

export const dynamic = 'force-dynamic'

export default async function MiPerfilPage() {
  const auth = await getAuthClaims()
  if (!auth) redirect('/login')
  const role = auth.role ?? ''

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm text-[var(--color-text-secondary)]">Mi cuenta</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Mi Perfil</h1>
      </header>
      <MiPerfilView role={role} />
    </section>
  )
}
