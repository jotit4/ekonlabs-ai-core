import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
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

  return <AgendaView />
}
