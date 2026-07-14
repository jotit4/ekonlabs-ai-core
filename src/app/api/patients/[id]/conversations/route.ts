import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'

interface RouteContext {
  params: Promise<{ id: string }>
}

export interface ConversationSummary {
  id: string
  role: string
  content: string
  created_at: string
  phone_number: string
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params

  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Check de rol: solo admin y doctor pueden ver conversaciones del paciente (A-03)
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  const appRole = claims?.app_role as string | undefined
  if (!['admin', 'doctor'].includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 1. Obtener phone_number del paciente (RLS filtra por tenant automáticamente)
  const { data: patient } = await supabase
    .from('patients')
    .select('phone_number')
    .eq('patient_id', id)
    .maybeSingle()

  if (!patient) {
    return Response.json({ error: 'Paciente no encontrado' }, { status: 404 })
  }

  if (!patient.phone_number) {
    return Response.json({ conversations: [] }, { status: 200 })
  }

  // 2. Listar conversaciones por phone_number (RLS filtra por tenant — NO agregar .eq('tenant_id', ...))
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, role, content, created_at, phone_number')
    .eq('phone_number', patient.phone_number)
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: 'Error al obtener conversaciones' }, { status: 500 })
  }

  return Response.json({ conversations: conversations ?? [] }, { status: 200 })
}
