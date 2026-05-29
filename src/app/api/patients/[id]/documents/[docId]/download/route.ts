import { createSupabaseServerClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { parseJwtPayload } from '@/lib/utils/jwt'

const BUCKET = 'patient-documents'
const ALLOWED_ROLES = ['receptionist', 'doctor', 'admin']
const SIGNED_URL_TTL_SECONDS = 60

interface RouteContext {
  params: Promise<{ id: string; docId: string }>
}

// ─── GET — genera una signed URL de corta duración para descargar ────────────

export async function GET(_request: Request, context: RouteContext) {
  const { id, docId } = await context.params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const appRole = (claims?.app_role ?? claims?.role) as string | undefined
  if (!ALLOWED_ROLES.includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // RLS garantiza que el doc pertenezca al tenant del usuario (AR14)
  const { data: doc, error } = await supabase
    .from('patient_documents')
    .select('storage_path')
    .eq('document_id', docId)
    .eq('patient_id', id)
    .maybeSingle()

  if (error) return Response.json({ error: 'Error al obtener el documento' }, { status: 500 })
  if (!doc) return Response.json({ error: 'Documento no encontrado' }, { status: 404 })

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS)

  if (signError || !signed?.signedUrl) {
    return Response.json({ error: 'Error al generar el enlace de descarga' }, { status: 500 })
  }

  await logAudit({
    action: 'patient_document_accessed',
    entity_type: 'patient',
    entity_id: id,
    supabase,
  })

  return Response.json({ url: signed.signedUrl }, { status: 200 })
}
