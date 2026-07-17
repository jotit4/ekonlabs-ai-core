import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { UserRole } from '@/types'
import { AgendaView } from './AgendaView'

export const dynamic = 'force-dynamic'

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
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

  // Atajo "ver mi día" (pedido ISADI 2026-07-17): un admin que además atiende
  // como profesional (p. ej. el director) suele necesitar entrar directo a SU
  // día. Si llega a la agenda global "en frío" (sin ningún query param), lo
  // llevamos a la vista Día con él mismo preseleccionado como profesional. En
  // cuanto navega (cualquier param presente) respetamos su elección — incluido
  // ver "Todos los profesionales" (que deja ?vista=... sin professional_id).
  // Solo aplica a admins vinculados a un professional_id; el resto (admin sin
  // profesional, recepción) mantiene el comportamiento previo.
  const sp = await searchParams
  const hasAnyParam = Object.keys(sp).length > 0
  if (initialRole === 'admin' && !hasAnyParam) {
    const { data: du } = await supabase
      .from('dashboard_users')
      .select('professional_id')
      .eq('user_id', user.id)
      .single()
    if (du?.professional_id) {
      redirect(`/agenda?vista=dia&professional_id=${du.professional_id}`)
    }
  }

  return <AgendaView initialRole={initialRole} />
}
