import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { landingForRole } from '@/lib/landing'
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

  redirect(landingForRole(role))
}
