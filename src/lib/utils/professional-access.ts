import 'server-only'
import type { createSupabaseServerClient } from '@/lib/supabase/server'

// Cliente Supabase server-side autenticado (RLS activo). Mismo tipo que retorna
// createSupabaseServerClient, para que las rutas puedan pasarlo sin casts.
type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * Autoriza el acceso a los recursos de un profesional (horarios / bloqueos).
 *
 * Reglas:
 * - admin / receptionist → acceso permitido sin restricción de `id`.
 * - doctor → permitido SOLO si su `professional_id` (resuelto desde
 *   `dashboard_users` por `user_id = auth.uid()`, mismo patrón que
 *   `api/me/professional`) coincide con el `id` de la URL.
 * - cualquier otro rol → denegado.
 *
 * No usa admin.ts / service role: las queries van con el cliente autenticado y
 * RLS filtra automáticamente (AR14). El `professional_id` del doctor NUNCA viene
 * del body — sale de `dashboard_users`.
 */
export async function authorizeProfessionalAccess(
  supabase: SupabaseServerClient,
  role: unknown,
  userId: string,
  id: string
): Promise<{ ok: true } | { ok: false; status: 403 | 500 }> {
  if (role === 'admin' || role === 'receptionist') {
    return { ok: true }
  }

  if (role === 'doctor') {
    // Resolver professional_id propio desde dashboard_users (patrón api/me/professional).
    // NO usar .eq('tenant_id', ...) — RLS filtra (AR14).
    const { data: dashboardUser, error } = await supabase
      .from('dashboard_users')
      .select('professional_id')
      .eq('user_id', userId)
      .single()

    if (error) {
      console.error('[authorizeProfessionalAccess] error:', error)
      return { ok: false, status: 500 }
    }

    if (dashboardUser?.professional_id && dashboardUser.professional_id === id) {
      return { ok: true }
    }

    return { ok: false, status: 403 }
  }

  return { ok: false, status: 403 }
}
