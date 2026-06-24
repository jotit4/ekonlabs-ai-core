import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { UserRole } from '@/types/index'

export const dynamic = 'force-dynamic'

// Landing por defecto SEGÚN EL ROL del usuario.
// Cada rol entra directo a la pantalla que más usa, sin pasar por la agenda.
// Pensado para crecer: para sumar un landing nuevo (ej. dueño/profesional)
// basta con agregar una entrada a este mapa.
const LANDING_BY_ROLE: Record<UserRole, string> = {
  // Recepción NO técnica → pantalla única "Modo recepción"
  receptionist: '/recepcion',
  // Por ahora doctor y admin siguen entrando a la agenda (sin cambios).
  // Cuando existan sus landings propios, se actualizan acá.
  doctor: '/agenda',
  admin: '/agenda',
}

// A dónde mandar si el JWT no trae un rol válido (caso borde).
// El layout del dashboard igual revalida el rol y fuerza re-login si falta.
const FALLBACK_LANDING = '/agenda'

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

  const destination = (role && LANDING_BY_ROLE[role]) || FALLBACK_LANDING
  redirect(destination)
}
