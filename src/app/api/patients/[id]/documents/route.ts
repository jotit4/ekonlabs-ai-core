import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { logAudit } from '@/lib/audit'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { DocumentMetadataSchema } from '@/lib/schemas/document.schema'
import type { PatientDocument } from '@/types/patients'

export type { PatientDocument }

const BUCKET = 'patient-documents'
const ALLOWED_ROLES = ['receptionist', 'doctor', 'admin']

interface RouteContext {
  params: Promise<{ id: string }>
}

// Sanea el nombre del archivo para usarlo en la ruta de Storage:
// quita separadores de ruta y colapsa caracteres problemáticos.
function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^\w.\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 200)
}

// ─── GET — lista metadata de documentos del paciente ─────────────────────────

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const appRole = (claims?.app_role ?? claims?.role) as string | undefined
  if (!ALLOWED_ROLES.includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // RLS filtra por tenant — no se usa .eq('tenant_id', ...) (AR14)
  const { data: documents, error } = await supabase
    .from('patient_documents')
    .select('document_id, patient_id, file_name, mime_type, size_bytes, source, created_at')
    .eq('patient_id', id)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: 'Error al obtener documentos' }, { status: 500 })
  return Response.json({ documents: documents ?? [] }, { status: 200 })
}

// ─── POST — sube un documento (multipart/FormData) ───────────────────────────

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const authError = null
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  if (!user || authError) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  const appRole = (claims?.app_role ?? claims?.role) as string | undefined
  if (!ALLOWED_ROLES.includes(appRole ?? '')) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) return Response.json({ error: 'Tenant no encontrado' }, { status: 401 })

  // Leer el archivo del multipart
  let file: File | null = null
  try {
    const form = await request.formData()
    const candidate = form.get('file')
    if (candidate instanceof File) file = candidate
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!file) {
    return Response.json({ error: 'No se envió ningún archivo' }, { status: 400 })
  }

  // Derivar metadata del File real (NO confiar en el cliente) y validar
  const validation = DocumentMetadataSchema.safeParse({
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
  })
  if (!validation.success) {
    return Response.json(
      { error: validation.error.issues[0]?.message ?? 'Archivo inválido' },
      { status: 400 }
    )
  }

  // Generar id en el server para construir la ruta y reusarlo en el INSERT
  const documentId = crypto.randomUUID()
  const safeName = sanitizeFileName(file.name)
  const storagePath = `${tenantId}/${id}/${documentId}_${safeName}`

  // Subir a Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    return Response.json({ error: 'Error al subir el archivo' }, { status: 500 })
  }

  // INSERT en la tabla — tenant_id explícito (columna NOT NULL)
  const { data: document, error: insertError } = await supabase
    .from('patient_documents')
    .insert({
      document_id: documentId,
      tenant_id: tenantId,
      patient_id: id,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      source: 'manual',
      uploaded_by: user.id,
    })
    .select('document_id, patient_id, file_name, mime_type, size_bytes, source, created_at')
    .single()

  if (insertError || !document) {
    // Rollback de Storage para no dejar huérfano
    await supabase.storage.from(BUCKET).remove([storagePath])
    return Response.json({ error: 'Error al guardar el documento' }, { status: 500 })
  }

  await logAudit({
    action: 'patient_document_uploaded',
    entity_type: 'patient',
    entity_id: id,
    supabase,
  })

  return Response.json({ document }, { status: 201 })
}
