import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { SystemPromptHistoryEntry } from '@/types/agente'

export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Autorización — solo admin
  const { data: sessionData } = await supabase.auth.getSession()
  const claims = parseJwtPayload(sessionData.session?.access_token ?? '')
  if (claims?.app_role !== 'admin') {
    return Response.json(
      { error: 'Solo administradores pueden ver el historial del prompt' },
      { status: 403 }
    )
  }

  // 3. Query con RLS automático — no agregar .eq('tenant_id', ...) (AR14)
  const { data, error } = await supabase
    .from('system_prompt_history')
    .select('id, tenant_id, user_id, previous_content, new_content, changed_at')
    .order('changed_at', { ascending: false })
    .limit(50)

  if (error) {
    return Response.json({ error: 'Error al obtener historial' }, { status: 500 })
  }

  return Response.json({ data: (data ?? []) as SystemPromptHistoryEntry[] })
}
