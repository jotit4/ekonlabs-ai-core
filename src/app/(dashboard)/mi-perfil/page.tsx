import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { MiPerfilView } from '@/components/mi-perfil/MiPerfilView'

export const dynamic = 'force-dynamic'

export default async function MiPerfilPage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  const role = (claims?.app_role ?? '') as string

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
