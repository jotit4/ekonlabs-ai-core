import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'

export async function GET(request: Request) {
  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Obtener query param ?q=
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (q.length < 2) {
    return Response.json({ error: 'Ingresá al menos 2 caracteres para buscar' }, { status: 400 })
  }
  if (q.length > 100) {
    return Response.json({ error: 'Búsqueda demasiado larga' }, { status: 400 })
  }

  // 3. Buscar pacientes — RLS filtra por tenant automáticamente
  // Se busca por DNI exacto si es solo dígitos de 7-8 chars,
  // en caso contrario por full_name ilike y phone_number ilike
  let query = supabase
    .from('patients')
    .select('patient_id, full_name, phone_number, obra_social, deletion_requested_at')
    .limit(10)

  const isDni = /^\d{7,8}$/.test(q)

  if (isDni) {
    // DNI exacto
    query = query.eq('dni', q)
  } else {
    // Búsqueda por nombre o teléfono (ilike)
    const pattern = `%${q}%`
    query = query.or(`full_name.ilike.${pattern},phone_number.ilike.${pattern}`)
  }

  const { data, error } = await query

  if (error) {
    console.error('[patients/search/GET] error:', error)
    return Response.json({ error: 'Error al buscar paciente' }, { status: 500 })
  }

  return Response.json({ patients: data ?? [] }, { status: 200 })
}
