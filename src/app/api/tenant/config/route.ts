import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'

interface ReceptionGroupConfig {
  label: string
  main_service_id: string | null
  order?: number
}

// Normaliza `tenants.rules.reception_groups` (migración 069) — objeto con
// clave = `services.reception_group` (migración 053) y valor = etiqueta
// visible + servicio principal para el flujo simplificado de recepción
// (NewTurnoModal). Descarta cualquier entrada mal formada en vez de dejarla
// pasar: nunca debe llegar al cliente algo que rompa `resolveGroupLabel`/
// `resolveGroupMainService` (src/lib/agenda/reception-groups.ts).
function normalizeReceptionGroups(raw: unknown): Record<string, ReceptionGroupConfig> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, ReceptionGroupConfig> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key) continue
    // Claves que pisarían el prototipo de `result` en vez de agregar una entrada.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>
    const label = entry.label
    const mainServiceId = entry.main_service_id
    if (typeof label !== 'string' || label.trim() === '') continue
    if (mainServiceId !== null && mainServiceId !== undefined && typeof mainServiceId !== 'string') continue
    // `order` (posición del botón del grupo) es opcional: solo se expone si es
    // un número finito; cualquier otra cosa se ignora sin descartar el grupo.
    const order = entry.order
    result[key] = {
      label,
      main_service_id: typeof mainServiceId === 'string' ? mainServiceId : null,
      ...(typeof order === 'number' && Number.isFinite(order) ? { order } : {}),
    }
  }
  return result
}

// Normaliza `tenants.rules.reception_default_group` (migración 069) — clave
// del grupo con el que trabaja el formulario simplificado de "Dar un turno"
// para el rol recepción. Cualquier valor que no sea un string no vacío
// equivale a "sin default" (el flujo simplificado se desactiva y recepción
// ve el mismo formulario completo que administración — ver NewTurnoModal).
function normalizeReceptionDefaultGroup(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null
}

// Normaliza `tenants.rules.agenda_area_focus_label` (migración 075) —
// etiqueta visible del foco de área en el selector "Ver" de la agenda (ver
// AgendaFilters.tsx). Es un DATO DE LA CUENTA, no un nombre fijo en el
// código, mismo criterio que `reception_groups[...].label` arriba. Si la
// cuenta no la configuró (o el valor no es un string no vacío), cae a
// 'Rehabilitación' — el texto que ISADI ya usa hoy en el resto de la UI
// (botón de grupo "Fisioterapia" aparte; esto es la etiqueta del FOCO, no de
// un grupo puntual).
function normalizeAgendaAreaFocusLabel(raw: unknown): string {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : 'Rehabilitación'
}

export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // RLS filtra automáticamente por tenant — AR14
  const { data, error } = await supabase
    .from('tenants')
    .select('uses_native_calendar, rules')
    .single()

  if (error || !data) {
    return Response.json({ error: 'Error al obtener configuración' }, { status: 500 })
  }

  // agenda_area_focus (tenants.rules) — ajuste ISADI: la agenda recorta a
  // servicios de rehabilitación SOLO para el tenant que lo configuró. Cualquier
  // otro valor (incluido ausente, string vacío, u otro tipo) equivale a "sin
  // foco" — el único valor válido es 'rehab'. Ver migración 062.
  const rules = data.rules as Record<string, unknown> | null
  const agendaAreaFocus = rules?.agenda_area_focus === 'rehab' ? 'rehab' : null
  // reception_groups / reception_default_group (tenants.rules, migración 069)
  // — "Fisioterapia" deja de ser un nombre fijo en el código: cada cuenta
  // define sus propios grupos de recepción acá. Se normalizan/validan antes
  // de exponerlos — nunca se devuelve `rules` completo (contrato fijado por
  // route.test.ts, incluye estas dos claves nuevas).
  const receptionGroups = normalizeReceptionGroups(rules?.reception_groups)
  const receptionDefaultGroup = normalizeReceptionDefaultGroup(rules?.reception_default_group)
  // agenda_area_focus_label (tenants.rules, migración 075) — etiqueta visible
  // del selector "Ver" (paso 2/3 del pedido de foco de área configurable).
  // Siempre resuelve a un string (fallback 'Rehabilitación'), a diferencia de
  // agenda_area_focus/reception_default_group: no representa "ausencia de
  // ajuste", solo el texto a mostrar cuando el selector aplica.
  const agendaAreaFocusLabel = normalizeAgendaAreaFocusLabel(rules?.agenda_area_focus_label)

  return Response.json(
    {
      uses_native_calendar: data.uses_native_calendar,
      agenda_area_focus: agendaAreaFocus,
      agenda_area_focus_label: agendaAreaFocusLabel,
      reception_groups: receptionGroups,
      reception_default_group: receptionDefaultGroup,
    },
    { status: 200 },
  )
}
