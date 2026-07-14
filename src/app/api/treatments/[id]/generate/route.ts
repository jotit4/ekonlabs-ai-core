import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import { patternSchema } from '@/lib/schemas/treatment.schema'
import {
  generateSeries,
  occurrenceDate,
  orderSlots,
  MAX_WEEKS,
  type SlotAvailability,
} from '@/lib/treatments/generate-series'
import type { WeeklySlot } from '@/lib/schemas/treatment.schema'
import type { AvailabilityShift } from '@/types/availability'

// POST /api/treatments/[id]/generate
// Genera la serie de N turnos del paquete (`treatment`) repitiendo el `pattern`
// semanal, respetando la disponibilidad real y el candado anti-overbooking POR
// PROFESIONAL (RPC 029). Saltea conflictos (feriado / service_exceptions /
// blocked_times / slot ocupado) SIN perder sesiones y corta por N / expires_at /
// MAX_WEEKS. NO es Server Action (AR10). NO crea migraciones. Reusa las RPCs 029.
//
// CRÍTICO (AR14/AR15): tenant_id SIEMPRE del JWT (nunca del body). Las RPCs son
// SECURITY DEFINER → reciben `p_org_id = tenantId` como frontera de aislamiento.
// Las queries autenticadas a `treatments`/`appointments` filtran por RLS → NO
// `.eq('tenant_id')`. NO admin.ts.
//
// La RPC `create_appointment` (029) NO acepta package_id/session_index → se hace
// en DOS pasos: 1) crear el turno con la RPC (candado + idempotencia), 2) UPDATE
// del turno DEVUELTO por la RPC con package_id/session_index. Usar SIEMPRE el
// appointment_id que DEVUELVE la RPC (cubre duplicate=true).

interface CreateApptRow {
  success: boolean
  appointment_id: string | null
  short_id: string | null
  duplicate: boolean
  error: string | null
}

interface AvailabilityRpcRow {
  available: boolean
  shifts: AvailabilityShift[] | null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. tenant_id + rol del JWT — NUNCA del body (AR-tenant)
  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Autorización por rol — admin o receptionist (mismo guard que /api/availability)
  const role = claims?.app_role
  if (role !== 'admin' && role !== 'receptionist') {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  // 4. id del path (params es Promise en Next.js 16)
  const { id: treatmentId } = await params

  // 5. Cargar el treatment (RLS 038 filtra por tenant — NO .eq('tenant_id'), AR14)
  const { data: treatment, error: treatmentError } = await supabase
    .from('treatments')
    .select('treatment_id, patient_id, service_id, professional_id, total_sessions, pattern, start_date, expires_at, status')
    .eq('treatment_id', treatmentId)
    .maybeSingle()

  if (treatmentError) {
    console.error('[treatments/generate] load error:', treatmentError)
    return Response.json({ error: 'Error al cargar el paquete' }, { status: 500 })
  }
  if (!treatment) {
    return Response.json({ error: 'Paquete no encontrado' }, { status: 404 })
  }
  if (treatment.status !== 'active') {
    return Response.json({ error: 'El paquete no está activo' }, { status: 409 })
  }

  // 6. Validar la FORMA del pattern leído de DB (defensa ante datos corruptos).
  //    El pattern ya NO trae profesional por slot: UN solo profesional atiende todo
  //    el paquete (`treatment.professional_id`) y se inyecta a cada slot acá, porque
  //    la RPC de disponibilidad/candado (029) es POR PROFESIONAL.
  const patternParsed = patternSchema.safeParse(treatment.pattern)
  if (!patternParsed.success) {
    console.error('[treatments/generate] pattern inválido:', patternParsed.error.issues)
    return Response.json({ error: 'El patrón del paquete es inválido' }, { status: 422 })
  }

  const professionalId = treatment.professional_id as string | null
  if (!professionalId) {
    return Response.json({ error: 'El paquete no tiene profesional asignado' }, { status: 422 })
  }

  // Inyectar el profesional único del paquete a cada slot (día + hora + profesional).
  const slots: WeeklySlot[] = patternParsed.data.slots.map((s) => ({
    day_of_week: s.day_of_week,
    time: s.time,
    professional_id: professionalId,
  }))

  const patientId = treatment.patient_id as string
  const serviceId = treatment.service_id as string
  const totalSessions = treatment.total_sessions as number
  const startDate = treatment.start_date as string
  const expiresAt = (treatment.expires_at as string | null) ?? null

  // 7. isSlotAvailable: cruza el slot del patrón con la disponibilidad real (029).
  //    Cachea por (fecha, profesional) — una fecha puede tener varios slots del
  //    mismo profesional, y evita repetir la RPC.
  const availabilityCache = new Map<string, AvailabilityShift[]>()

  async function shiftsFor(date: string, professionalId: string): Promise<AvailabilityShift[]> {
    const key = `${date}|${professionalId}`
    const cached = availabilityCache.get(key)
    if (cached) return cached

    const { data, error } = await supabase.rpc('check_clinic_availability', {
      p_org_id: tenantId,
      p_date: date,
      // p_timezone omitido → default BA (igual que /api/availability)
      p_service_id: serviceId,
      p_professional_id: professionalId,
    })

    if (error) {
      console.error('[treatments/generate] check_clinic_availability error:', error)
      availabilityCache.set(key, [])
      return []
    }

    const row = (Array.isArray(data) ? data[0] : data) as AvailabilityRpcRow | undefined
    const shifts = (row?.shifts ?? []) as AvailabilityShift[]
    availabilityCache.set(key, shifts)
    return shifts
  }

  // El helper `generateSeries` es PURO y necesita un `isSlotAvailable` SÍNCRONO,
  // pero la disponibilidad viene de una RPC async. Estrategia: una pre-pasada
  // async recorre las MISMAS ocurrencias que el helper (usando sus exports
  // `orderSlots` + `occurrenceDate` + `MAX_WEEKS` → cero duplicación de la lógica
  // de calendario/cortes), resuelve la disponibilidad y la cachea en un lookup
  // síncrono. Luego se corre el helper con ese lookup ya poblado.
  const slotAvailLookup = new Map<string, SlotAvailability | null>()

  async function resolveOccurrence(date: string, slot: WeeklySlot): Promise<void> {
    const key = `${date}|${slot.time}|${slot.professional_id}`
    if (slotAvailLookup.has(key)) return
    const shifts = await shiftsFor(date, slot.professional_id)
    const match = shifts.find(
      (s) => s.open === slot.time && s.professional_id === slot.professional_id,
    )
    slotAvailLookup.set(
      key,
      match ? { start_at: match.slot_start_iso, end_at: match.slot_end_iso } : null,
    )
  }

  // Excluir slots de fin de semana (sábado=5, domingo=6 en 0=lunes..6=domingo) ANTES
  // de pre-resolver: refleja exactamente la misma regla que el helper puro, así no
  // se gasta una RPC de disponibilidad en una ocurrencia que nunca se va a colocar.
  const orderedSlots = orderSlots(slots).filter(
    (s) => s.day_of_week !== 5 && s.day_of_week !== 6,
  )
  // Pre-resolución: recorrer semana a semana resolviendo disponibilidad hasta
  // colocar N o agotar cortes (N / expires_at / MAX_WEEKS). Se cuenta "colocadas"
  // según la disponibilidad REAL para no resolver de más.
  {
    let colocadas = 0
    for (let week = 0; week < MAX_WEEKS; week++) {
      if (colocadas >= totalSessions) break
      let allExpired = expiresAt != null
      for (const slot of orderedSlots) {
        if (colocadas >= totalSessions) break
        const date = occurrenceDate(startDate, slot.day_of_week, week)
        if (expiresAt != null && date > expiresAt) continue
        allExpired = false
        await resolveOccurrence(date, slot)
        const key = `${date}|${slot.time}|${slot.professional_id}`
        if (slotAvailLookup.get(key) != null) colocadas += 1
      }
      if (allExpired) break
    }
  }

  // 8. Ejecutar el helper PURO con el lookup síncrono ya poblado.
  const plan = generateSeries({
    slots,
    start_date: startDate,
    total_sessions: totalSessions,
    expires_at: expiresAt,
    isSlotAvailable: (date, slot) => {
      const key = `${date}|${slot.time}|${slot.professional_id}`
      return slotAvailLookup.get(key) ?? null
    },
  })

  // 9. Crear cada turno: paso 1 create_appointment (029), paso 2 UPDATE package_id/session_index.
  let creados = 0
  for (const placement of plan.placements) {
    const generatedId = crypto.randomUUID()
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_appointment', {
      p_org_id: tenantId,
      p_patient_id: patientId,
      p_service_id: serviceId,
      p_start: placement.start_at,
      p_end: placement.end_at,
      p_appointment_id: generatedId,
      p_professional_id: placement.slot.professional_id,
      p_booked_via: 'manual',
    })

    if (rpcError) {
      console.error('[treatments/generate] create_appointment error:', rpcError)
      continue // error duro de la RPC → no aborta la serie completa
    }

    const apptRow = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as CreateApptRow | undefined
    if (!apptRow || !apptRow.success || !apptRow.appointment_id) {
      // p.ej. professional_service_mismatch → contabilizar como no creado
      console.warn('[treatments/generate] create_appointment falló:', apptRow?.error)
      continue
    }

    // Paso 2: UPDATE sobre el appointment_id DEVUELTO por la RPC (cubre duplicate=true).
    // RLS de appointments filtra por tenant — NO .eq('tenant_id') (AR14).
    const { error: updateError } = await supabase
      .from('appointments')
      .update({ package_id: treatmentId, session_index: placement.session_index })
      .eq('appointment_id', apptRow.appointment_id)

    if (updateError) {
      console.error('[treatments/generate] update package_id error:', updateError)
      // turno creado pero no ligado: lo dejamos logueado; la idempotencia de
      // re-ejecución (AC7) lo corrige en la próxima corrida.
    }

    // Solo los turnos NUEVOS cuentan como "creados" (los duplicados no).
    if (!apptRow.duplicate) creados += 1
  }

  // 10. sessions_remaining = N (total_sessions): al GENERAR (= crear la serie) ninguna
  //     sesión está consumida todavía. El contador honesto de la ficha ya NO deriva de
  //     este campo (lee los appointments reales), pero lo dejamos consistente: "N
  //     disponibles al crear". El decremento al consumir lo hace la Story 13.6.
  //     Antes se seteaba al COUNT de turnos creados → si la serie quedaba corta (ej.
  //     2 de 10) mostraba "8 consumidas". Ese era el bug raíz del contador.
  const { error: trUpdateError } = await supabase
    .from('treatments')
    .update({ sessions_remaining: totalSessions })
    .eq('treatment_id', treatmentId)
  if (trUpdateError) {
    console.error('[treatments/generate] update sessions_remaining error:', trUpdateError)
  }

  // 11. Audit log
  await logAudit({
    action: 'treatment_generated',
    entity_type: 'treatment',
    entity_id: treatmentId,
    supabase,
  })

  // 12. Respuesta con el resumen. `requested` vs `placed` permite a la UI informar
  //     con claridad cuántas entraron, y `blocked_by_expiry` si el vencimiento las
  //     recortó (en vez de truncar en silencio).
  const placed = plan.placements.length
  return Response.json(
    {
      success: true,
      treatment_id: treatmentId,
      creados,
      salteados: plan.salteados,
      no_colocados: plan.no_colocados,
      // Contrato explícito de cobertura de la serie.
      requested: totalSessions,
      placed,
      blocked_by_expiry: plan.blocked_by_expiry,
    },
    { status: 200 },
  )
}
