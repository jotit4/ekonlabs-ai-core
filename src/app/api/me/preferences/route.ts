import 'server-only'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'

// Preferencias del usuario logueado — `dashboard_users.preferences` (jsonb,
// migración 075). Paso 2/3 del pedido del dueño sobre el foco de área de la
// agenda (migración 062): "un selector al lado de los filtros del
// Calendario... que sea persistente... guardado como config de preferencia
// para ese usuario logueado". Por eso vive en la FILA DEL USUARIO
// (dashboard_users), no en tenants.rules (eso es config de la CUENTA) ni en
// localStorage/URL (el dueño pidió explícitamente "en la base, por usuario").
//
// Solo se expone/acepta un subconjunto CONOCIDO de claves — nunca la fila
// entera de dashboard_users ni un jsonb arbitrario que el cliente pudiera
// inflar sin límite. Hoy la única clave es `agenda_view` (selector "Ver" de
// la agenda — ver AgendaView.tsx / AgendaFilters.tsx):
//   - 'foco'  = respeta el recorte por defecto de la cuenta
//               (`agenda_area_focus`, migración 062).
//   - 'todos' = sin recorte, cualquiera sea el default de la cuenta.
// Cualquier otra clave en el body del PATCH se descarta en silencio (zod
// strip por defecto, sin .strict()) — no es un ataque, es simplemente una
// clave que esta versión de la API no conoce todavía. Un valor inválido para
// una clave CONOCIDA (ej. agenda_view: 'rehab') sí es un 400: ahí el cliente
// sí está tratando de guardar algo que la API no puede interpretar.
//
// RLS: `dashboard_users_update_own` (migración 034) ya permite a cualquier
// usuario autenticado actualizar su propia fila (`user_id = auth.uid()`); no
// hace falta ninguna policy nueva (ver comentario de la migración 075). El
// cliente Supabase usado acá es el de la request (createSupabaseServerClient,
// NO un cliente con service_role), así que RLS sigue aplicando siempre.

const PreferencesPatchSchema = z.object({
  agenda_view: z.enum(['foco', 'todos']).optional(),
})

interface UserPreferences {
  agenda_view?: 'foco' | 'todos'
}

// Normaliza lo leído de la DB. `preferences` es jsonb libre en Postgres — una
// fila corrupta o editada a mano no debe tirar la ruta abajo, solo perder esa
// clave puntual (mismo criterio que normalizeReceptionGroups en
// /api/tenant/config).
function normalizePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const value = (raw as Record<string, unknown>).agenda_view
  return value === 'foco' || value === 'todos' ? { agenda_view: value } : {}
}

export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  const sessionAuth = await getAuthClaims()
  if (!sessionAuth) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // RLS dashboard_users_own_record / dashboard_users_update_own restringen a
  // la fila propia (user_id = auth.uid()).
  const { data, error } = await supabase
    .from('dashboard_users')
    .select('preferences')
    .eq('user_id', sessionAuth.userId)
    .single()

  if (error) {
    console.error('[api/me/preferences/GET] error:', error)
    return Response.json({ error: 'Error al obtener preferencias' }, { status: 500 })
  }

  return Response.json({ data: normalizePreferences(data?.preferences) })
}

export async function PATCH(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  const sessionAuth = await getAuthClaims()
  if (!sessionAuth) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = PreferencesPatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  // Merge parcial: el body del PATCH solo trae las claves que cambian, no
  // todas las preferencias — hace falta leer el valor ACTUAL para no perder
  // otras claves al hacer el UPDATE (jsonb entero; supabase-js no tiene un
  // merge nativo tipo `jsonb ||` desde el cliente).
  const { data: current, error: readError } = await supabase
    .from('dashboard_users')
    .select('preferences')
    .eq('user_id', sessionAuth.userId)
    .single()

  if (readError) {
    console.error('[api/me/preferences/PATCH] error de lectura:', readError)
    return Response.json({ error: 'Error al actualizar preferencias' }, { status: 500 })
  }

  // Se preservan TAL CUAL las claves que esta versión de la API todavía no
  // conoce (las escribiría una versión más nueva desplegada en paralelo):
  // normalizar antes de mergear las borraría en silencio. Las claves
  // conocidas se pisan con lo validado por zod, y lo que se DEVUELVE al
  // cliente sí pasa por `normalizePreferences`.
  const rawCurrent =
    current?.preferences && typeof current.preferences === 'object' && !Array.isArray(current.preferences)
      ? (current.preferences as Record<string, unknown>)
      : {}
  const merged: Record<string, unknown> = { ...rawCurrent, ...parsed.data }

  const { data, error } = await supabase
    .from('dashboard_users')
    .update({ preferences: merged })
    .eq('user_id', sessionAuth.userId)
    .select('preferences')
    .single()

  if (error) {
    console.error('[api/me/preferences/PATCH] error:', error)
    return Response.json({ error: 'Error al actualizar preferencias' }, { status: 500 })
  }

  return Response.json({ data: normalizePreferences(data?.preferences) })
}
