import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // Ya logueado: a "/", que redirige a su landing según el rol.
    redirect('/')
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
