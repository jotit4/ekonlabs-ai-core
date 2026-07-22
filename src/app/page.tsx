import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { landingFor, type AttentionMode } from '@/lib/landing'
import type { UserRole } from '@/types/index'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  const role = (claims?.app_role ?? claims?.role) as UserRole | undefined

  // Subtipo de atención (migración 056): un "Doctor-fila" (attention_mode =
  // 'walk_in') entra directo a SU día en el Calendario, porque atiende por orden
  // de llegada. El resto conserva la landing de su rol. Se lee siempre —también
  // para admin— porque el subtipo es ortogonal al rol: el director atiende por
  // fila sin dejar de ser admin.
  const { data: du } = await supabase
    .from('dashboard_users')
    .select('professional_id, attention_mode')
    .eq('user_id', user.id)
    .single()

  redirect(
    landingFor({
      role,
      professionalId: du?.professional_id ?? null,
      attentionMode: (du?.attention_mode ?? null) as AttentionMode | null,
    }),
  )
}
