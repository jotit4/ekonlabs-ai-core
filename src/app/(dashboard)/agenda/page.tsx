import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { UserRole } from '@/types'
import { AgendaView } from './AgendaView'

export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')

  // El doctor NO accede a la agenda global — su vista es "Mi Agenda".
  // Guard server-side: redirige antes de renderizar el client component (sin parpadeo).
  if (claims?.app_role === 'doctor') {
    redirect('/agenda/mi-agenda')
  }

  // Rol resuelto server-side (mismo criterio que useUserRole: app_role ?? role).
  // Se pasa como `initialRole` para que el PRIMER frame de AgendaView ya sea el
  // correcto (modo turnero / foco de área), sin el parpadeo de resolver el rol
  // async en el cliente.
  const initialRole = (claims?.app_role ?? claims?.role ?? null) as UserRole | null

  return <AgendaView initialRole={initialRole} />
}
