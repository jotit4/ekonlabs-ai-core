import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { AppSidebar } from '@/components/AppSidebar'
import { DashboardProviders } from './providers'
import { ShadowModeBanner } from '@/components/ShadowModeBanner'
import type { UserRole } from '@/types/index'

export const dynamic = 'force-dynamic'

const VALID_ROLES: UserRole[] = ['receptionist', 'doctor', 'admin']

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createSupabaseServerClient()

  // Double auth guard: proxy.ts ya redirige, aquí es segunda capa
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  const role = (claims?.app_role ?? claims?.role) as UserRole | undefined

  // If role is missing or unknown — force re-login
  if (!role || !VALID_ROLES.includes(role)) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <DashboardProviders>
      <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
        <a href="#main-content" className="sr-only focus:not-sr-only">
          Ir al contenido principal
        </a>
        <AppSidebar role={role} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <ShadowModeBanner />
          <main
            id="main-content"
            className="flex-1 overflow-auto pb-14 lg:pb-0"
          >
            {children}
          </main>
        </div>
      </div>
    </DashboardProviders>
  )
}
