import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { AgentPromptEditor } from '@/components/configuracion/AgentPromptEditor'

export const dynamic = 'force-dynamic'

export default async function AgentePage() {
  const auth = await getAuthClaims()
  if (!auth) redirect('/login')
  const role = auth.role ?? ''

  if (!['admin', 'doctor', 'receptionist'].includes(role)) {
    redirect('/agenda')
  }

  if (role === 'doctor') {
    redirect('/mi-jornada')
  }

  const isAdmin = role === 'admin'

  // Shadow mode vive en `tenants` y su endpoint es admin-only (Story 6.5).
  // Sólo se pasa a AgentPromptEditor cuando el rol es admin; no exponer a
  // receptionist/doctor un control que el backend rechazaría.
  let initialShadowMode = false
  if (isAdmin) {
    const supabase = await createSupabaseServerClient()
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
      <AgentPromptEditor
        isAdmin={isAdmin}
        initialShadowMode={initialShadowMode}
        canEdit={role !== 'doctor'}
      />
    </section>
  )
}
