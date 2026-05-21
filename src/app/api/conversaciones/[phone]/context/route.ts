import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { FastAPIClient, FastAPIError } from '@/lib/fastapi/client'
import type { AgentContext } from '@/types/conversations'

export async function GET(
  _request: Request,
  context: { params: Promise<{ phone: string }> }
) {
  const { phone } = await context.params

  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()

  if (!user || !session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Obtener tenant_id del JWT
  const claims = parseJwtPayload(session.access_token)
  const tenantId = claims?.tenant_id as string | undefined
  if (!tenantId) {
    return Response.json({ error: 'tenant_id no disponible en el JWT' }, { status: 400 })
  }

  // 3. Verificar env vars del servidor (no exponer al cliente)
  const fastapiBaseUrl = process.env.FASTAPI_BASE_URL
  const fastapiApiKey = process.env.FASTAPI_API_KEY
  if (!fastapiBaseUrl || !fastapiApiKey) {
    // Degradación silenciosa — FastAPI no configurado
    return Response.json({ context: null })
  }

  // 4. Llamar a FastAPI via FastAPIClient (server-side only)
  try {
    const client = new FastAPIClient(fastapiBaseUrl, fastapiApiKey)
    const data = await client.request<AgentContext>(
      `/api/v1/tenants/${tenantId}/conversations/${phone}/context`
    )
    return Response.json({ context: data })
  } catch (err) {
    if (err instanceof FastAPIError || err instanceof Error) {
      console.error('[context/GET] FastAPI error:', err)
    }
    // Fallback: leer datos del paciente + último turno activo desde Supabase
    try {
      const { data: patient } = await supabase
        .from('patients')
        .select('patient_id, full_name, phone_number')
        .eq('phone_number', phone)
        .maybeSingle()
      if (patient?.full_name) {
        const fallbackContext: AgentContext = {
          patient_name: patient.full_name,
          phone_number: patient.phone_number,
        }

        // Enriquecer con el último turno activo (confirmed o pending_calendar)
        try {
          const { data: appointment } = await supabase
            .from('appointments')
            .select('start_at, status, services(name)')
            .eq('patient_id', patient.patient_id)
            .in('status', ['confirmed', 'pending_calendar'])
            .order('start_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (appointment) {
            // Supabase infiere services como array; castear a través de unknown para extraer el objeto
            const svc = (appointment.services as unknown) as { name: string } | null
            fallbackContext.service_requested = svc?.name ?? null
            fallbackContext.slot_requested = appointment.start_at
            fallbackContext.detected_intent = 'Turno confirmado'
          }
        } catch {
          // ignorar — enriquecimiento fallido, devolver contexto básico
        }

        return Response.json({ context: fallbackContext })
      }
    } catch {
      // ignorar — fallback también falló
    }
    return Response.json({ context: null })
  }
}
