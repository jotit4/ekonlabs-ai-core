import { redirect } from 'next/navigation'
import { Toaster } from 'sonner'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { AppSidebar } from '@/components/AppSidebar'
import { AppTopbar } from '@/components/AppTopbar'
import { DashboardProviders } from './providers'
import { ShadowModeBanner } from '@/components/ShadowModeBanner'
import { OnboardingProvider } from '@/components/onboarding/OnboardingProvider'
import type { UserRole } from '@/types/index'

export const dynamic = 'force-dynamic'

const VALID_ROLES: UserRole[] = ['receptionist', 'doctor', 'admin']

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Double auth guard: proxy.ts ya redirige, aquí es segunda capa.
  // Validación LOCAL de claims (firma ES256 + exp verificadas contra la JWKS
  // cacheada) — sin round-trip de red por navegación. El refresh + la detección
  // de revocación viven en el proxy (una vez por navegación).
  const auth = await getAuthClaims()
  if (!auth) redirect('/login')

  const role = auth.role as UserRole | undefined
  const tenantId = auth.tenantId

  // If role or tenant_id missing — JWT is stale/incomplete, force re-login
  if (!role || !VALID_ROLES.includes(role) || !tenantId) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <DashboardProviders>
      <OnboardingProvider role={role}>
      <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
        <a href="#main-content" className="sr-only focus:not-sr-only">
          Ir al contenido principal
        </a>
        <AppSidebar role={role} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <AppTopbar role={role} />
          <ShadowModeBanner />
          <main
            id="main-content"
            className="flex-1 overflow-auto pb-14 lg:pb-0"
          >
            {children}
          </main>
        </div>
      </div>
      <Toaster position="bottom-center" richColors closeButton />
      </OnboardingProvider>
    </DashboardProviders>
  )
}
