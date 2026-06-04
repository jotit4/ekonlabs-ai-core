import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { AgentPromptEditor } from '@/components/configuracion/AgentPromptEditor'
import { ShadowModeToggle } from '@/components/configuracion/ShadowModeToggle'

export const dynamic = 'force-dynamic'

export default async function AgentePage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  const role = claims?.app_role as string

  if (!['admin', 'doctor', 'receptionist'].includes(role)) {
    redirect('/agenda')
  }

  const isAdmin = role === 'admin'

  // Shadow mode vive en `tenants` y su endpoint es admin-only (Story 6.5).
  // Sólo se renderiza para admin; no exponer a receptionist/doctor un control
  // que el backend rechazaría.
  let initialShadowMode = false
  if (isAdmin) {
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('shadow_mode_enabled')
      .single()
    initialShadowMode = tenantData?.shadow_mode_enabled ?? false
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm text-[var(--color-text-secondary)]">Configuración</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Agente IA</h1>
      </header>
      <AgentPromptEditor />
      {isAdmin && (
        <>
          <hr className="border-[var(--color-border)] my-8" />
          <ShadowModeToggle initialValue={initialShadowMode} />
        </>
      )}
    </section>
  )
}
