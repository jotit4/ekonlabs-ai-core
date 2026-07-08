import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { logAudit } from '@/lib/audit'
import {
  statusPatchBodySchema,
  ABSENCE_DECISION_AUDIT_ACTION,
} from '@/lib/schemas/absence-decision.schema'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // params es Promise en Next.js 16 — siempre await
  const { id } = await params

  // 0. Validar formato UUID antes de cualquier query
  if (!UUID_REGEX.test(id)) {
    return Response.json({ error: 'ID de turno inválido' }, { status: 400 })
  }

  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const sessionAuth = await getAuthClaims()
  const user = sessionAuth ? { id: sessionAuth.userId, email: sessionAuth.claims.email as string | undefined } : null
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 2. Parsear y validar body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  // Validación con zod (Story 13.6). `status` obligatorio (cancelled|completed|no_show).
  // `decision` (recover|consume|justify) y `note` opcionales — sólo para turnos de serie.
  // El schema garantiza: 'completed' no admite decisión; 'justify' exige nota no vacía.
  const parsed = statusPatchBodySchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return Response.json(
      { error: firstIssue?.message ?? 'Datos inválidos', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { status, decision, note } = parsed.data

  // ── Story 13.6 — flujo de DECISIÓN MANUAL (turnos de serie) ────────────────
  // Sólo si la UI envió `decision`. Sin `decision`, el comportamiento es el legacy
  // (turnos sueltos / flujo directo) — intacto, ver más abajo.
  if (decision !== undefined) {
    // Leer package_id + status del turno: si package_id es null → NO es de serie → 400.
    // La UI no debería llamar con `decision` en turnos sueltos; esto es defensa server-side.
    // NO .eq('tenant_id') — RLS de appointments filtra por tenant (AR14).
    const { data: apt, error: aptError } = await supabase
      .from('appointments')
      .select('package_id, status')
      .eq('appointment_id', id)
      .maybeSingle()

    if (aptError) {
      console.error('[appointments/[id]/status/PATCH] error leyendo turno:', aptError)
      return Response.json({ error: 'Error al actualizar el estado del turno' }, { status: 500 })
    }
    if (!apt) {
      return Response.json({ error: 'Turno no encontrado' }, { status: 404 })
    }
    if (!apt.package_id) {
      return Response.json(
        { error: 'El turno no pertenece a una serie' },
        { status: 400 }
      )
    }
    // Idempotencia (CR 13.6): si el turno YA está en el estado solicitado, la decisión
    // ya fue aplicada (doble click, reintento, otra pestaña) → no repetir el descuento.
    if (apt.status === status) {
      return Response.json({ error: 'decision_already_applied' }, { status: 409 })
    }

    // ORDEN (CR 13.6): primero el status del turno, DESPUÉS el descuento. Sin
    // transacciones multi-tabla (sin RPC), si algo falla a mitad de camino es
    // preferible un sub-descuento VISIBLE (status aplicado, contador sin tocar,
    // error explícito) a un sobre-descuento silencioso (descontado sin marcar →
    // reintento → doble descuento).
    const updatePayload: { status: typeof status; cancellation_reason?: string } = { status }
    if (decision === 'justify' && note !== undefined) {
      updatePayload.cancellation_reason = note
    }

    const { error: updateError, count } = await supabase
      .from('appointments')
      .update(updatePayload, { count: 'exact' })
      .eq('appointment_id', id)

    if (updateError) {
      console.error('[appointments/[id]/status/PATCH] update error:', updateError)
      return Response.json({ error: 'Error al actualizar el estado del turno' }, { status: 500 })
    }
    if (count === 0) {
      return Response.json({ error: 'Turno no encontrado' }, { status: 404 })
    }

    // 'consume' → descontar 1 sesión del tratamiento (piso en 0, nunca negativo).
    // RLS 038 permite UPDATE de treatments al rol del tenant (receptionist/doctor/admin).
    // NO .eq('tenant_id') (AR14). NO admin.ts (AR15).
    if (decision === 'consume') {
      const { data: trt, error: trtReadError } = await supabase
        .from('treatments')
        .select('sessions_remaining')
        .eq('treatment_id', apt.package_id)
        .maybeSingle()

      if (trtReadError) {
        console.error('[appointments/[id]/status/PATCH] error leyendo tratamiento:', trtReadError)
        return Response.json({ error: 'Error al actualizar el estado del turno' }, { status: 500 })
      }
      if (!trt) {
        return Response.json({ error: 'Tratamiento no encontrado' }, { status: 404 })
      }

      // Concurrencia optimista (CR 13.6): el UPDATE sólo aplica si sessions_remaining
      // no cambió entre lectura y escritura (carrera entre pestañas). Un reintento
      // con re-lectura; si vuelve a fallar → error explícito (el status ya quedó
      // aplicado; el contador se verifica en la ficha).
      let remaining = trt.sessions_remaining ?? 0
      let discounted = false
      for (let attempt = 0; attempt < 2 && !discounted; attempt++) {
        if (attempt > 0) {
          const { data: retry } = await supabase
            .from('treatments')
            .select('sessions_remaining')
            .eq('treatment_id', apt.package_id)
            .maybeSingle()
          if (!retry) break
          remaining = retry.sessions_remaining ?? 0
        }
        const nextRemaining = Math.max(remaining - 1, 0)
        const { error: trtUpdateError, count: trtCount } = await supabase
          .from('treatments')
          .update({ sessions_remaining: nextRemaining }, { count: 'exact' })
          .eq('treatment_id', apt.package_id)
          .eq('sessions_remaining', remaining)

        if (trtUpdateError) {
          console.error('[appointments/[id]/status/PATCH] error decrementando sesiones:', trtUpdateError)
          return Response.json(
            { error: 'El estado del turno se aplicó pero no se pudo descontar la sesión. Verificá el contador del paquete en la ficha del paciente.' },
            { status: 500 }
          )
        }
        discounted = (trtCount ?? 0) > 0
      }

      if (!discounted) {
        console.error('[appointments/[id]/status/PATCH] no se pudo descontar la sesión (carrera):', id)
        return Response.json(
          { error: 'El estado del turno se aplicó pero no se pudo descontar la sesión. Verificá el contador del paquete en la ficha del paciente.' },
          { status: 500 }
        )
      }
    }

    // Audit: registrar la decisión específica de ausentismo (Story 13.6).
    await logAudit({
      action: ABSENCE_DECISION_AUDIT_ACTION[decision],
      entity_type: 'appointment',
      entity_id: id,
      supabase,
    })

    return Response.json({ success: true }, { status: 200 })
  }

  // ── Flujo LEGACY (turnos sueltos / sin decisión) ──────────────────────────
  // Comportamiento idéntico al previo: aplica el status sin tocar treatments.
  // NO agregar .eq('tenant_id', tenantId) — RLS con cliente autenticado lo filtra (AR14)
  const { error: updateError, count } = await supabase
    .from('appointments')
    .update({ status }, { count: 'exact' })
    .eq('appointment_id', id)

  if (updateError) {
    console.error('[appointments/[id]/status/PATCH] update error:', updateError)
    return Response.json({ error: 'Error al actualizar el estado del turno' }, { status: 500 })
  }

  if (count === 0) {
    return Response.json({ error: 'Turno no encontrado' }, { status: 404 })
  }

  // Audit log
  const auditAction =
    status === 'cancelled'
      ? 'appointment_cancelled'
      : status === 'completed'
        ? 'appointment_completed'
        : 'appointment_no_show'

  await logAudit({
    action: auditAction,
    entity_type: 'appointment',
    entity_id: id,
    supabase,
  })

  return Response.json({ success: true }, { status: 200 })
}
