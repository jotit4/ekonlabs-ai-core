import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import LoginForm from './LoginForm'
import type { UserRole } from '@/types/index'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: { session } } = await supabase.auth.getSession()
    const claims = parseJwtPayload(session?.access_token ?? '')
    const role = claims?.role as UserRole
    redirect(role === 'doctor' ? '/pacientes' : '/agenda')
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        <p className="text-sm text-[var(--color-text-secondary)]">ekonlabs</p>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.3px]">
          Iniciar sesión
        </h1>
        <LoginForm />
      </div>
    </section>
  )
}
