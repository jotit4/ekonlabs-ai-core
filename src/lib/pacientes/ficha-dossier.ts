import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import type {
  FichaDossier,
  FichaEvolucionRow,
  FichaTreatmentBlock,
} from '@/types/ficha'
import { buildSessionRows, pickTratamientoObjetivo } from './ficha-helpers'

// getFichaDossier — arma los datos de la "Ficha kinesiológica" imprimible (Fase 3).
//
// Server-only. Recibe un cliente Supabase YA AUTENTICADO (createSupabaseServerClient,
// llamado una vez en el Server Component de la página) — NO crea uno propio, para no
// duplicar la lectura de cookies(). Todas las queries de negocio pasan por ESTE cliente
// y respetan RLS (AR14: sin `.eq('tenant_id', ...)`).
//
// RLS: `session_notes` (041) y `treatment_plans` (040) se abrieron a receptionist en la
// migración 048 (en ISADI recepción carga toda la ficha) — los 3 roles ven la evolución
// y el plan. El cliente autenticado respeta esa RLS.
//
// CAMPOS DE ADMISIÓN (migración 047): lugar, ocupacion, derivacion, actividad_fisica,
// cirugias y primary_professional_id ("KLGO a cargo") viven en `patients`. Si el entorno
// no tiene la 047/042 aplicada, la query FULL cae al fallback BASE (sin esos campos).
//
// ⚠️ DEPENDENCIA DE RUNTIME: antecedentes/medicacion (migración 042), treatment_plans
// (040) y session_notes (041) pueden no estar aplicadas aún en el entorno (mismo riesgo
// documentado en session-note/route.ts y clinical-data/route.ts). Cada bloque degrada
// a vacío + flag en `limitations` en vez de romper toda la ficha.

const PATIENT_SELECT_FULL =
  'patient_id, full_name, dni, date_of_birth, phone_number, address, ' +
  'obra_social, obra_social_number, reason_for_visit, notes, antecedentes, medicacion, cirugias, ' +
  'lugar, ocupacion, derivacion, actividad_fisica, ' +
  'primary_professional_id, professionals!patients_primary_professional_id_fkey(name)'

// Fallback si alguna columna de la 042/047 no existe en el entorno (código 42703):
// solo los campos que siempre existieron (sin clínicos, sin campos de admisión nuevos,
// sin el profesional a cargo) — la vista los muestra como "—".
const PATIENT_SELECT_BASE =
  'patient_id, full_name, dni, date_of_birth, phone_number, address, ' +
  'obra_social, obra_social_number, reason_for_visit, notes'

const TREATMENTS_SELECT_FULL =
  'treatment_id, service_id, total_sessions, status, created_at, services(name), ' +
  'appointments(appointment_id, session_index, start_at, status), treatment_plans(objetivo)'

const TREATMENTS_SELECT_BASE =
  'treatment_id, service_id, total_sessions, status, created_at, services(name), ' +
  'appointments(appointment_id, session_index, start_at, status)'

interface NameEmbed {
  name: string
}

function extractName(embed: NameEmbed[] | NameEmbed | null | undefined): string | null {
  if (!embed) return null
  if (Array.isArray(embed)) return embed[0]?.name ?? null
  return embed.name ?? null
}

interface PatientRow {
  patient_id: string
  full_name: string
  dni: string | null
  date_of_birth: string | null
  phone_number: string
  address: string | null
  obra_social: string | null
  obra_social_number: string | null
  reason_for_visit: string | null
  notes: string | null
  antecedentes?: string | null
  medicacion?: string | null
  cirugias?: string | null
  lugar?: string | null
  ocupacion?: string | null
  derivacion?: string | null
  actividad_fisica?: string | null
  primary_professional_id?: string | null
  professionals?: NameEmbed[] | NameEmbed | null
}

interface ObjetivoEmbed {
  objetivo: string | null
}

interface TreatmentSessionRow {
  appointment_id: string
  session_index: number | null
  start_at: string
  status: string
}

interface TreatmentRow {
  treatment_id: string
  service_id: string
  total_sessions: number
  status: string
  created_at: string
  services: NameEmbed[] | NameEmbed | null
  appointments: TreatmentSessionRow[] | null
  treatment_plans?: ObjetivoEmbed[] | ObjetivoEmbed | null
}

interface SessionNoteRow {
  session_note_id: string
  worked_on: string | null
  progress: string | null
  author_id: string | null
  appointments: { session_index: number | null; start_at: string } | { session_index: number | null; start_at: string }[] | null
}

// Código Postgres "columna no existe" (migración 042 no aplicada).
const UNDEFINED_COLUMN = '42703'

/**
 * Devuelve el paciente (con embed del profesional a cargo) o null si no existe /
 * no es visible por RLS (otro tenant). Reintenta sin antecedentes/medicacion si la
 * migración 042 todavía no está aplicada en el entorno.
 */
async function fetchPatient(
  supabase: SupabaseClient,
  patientId: string,
): Promise<{ patient: PatientRow | null; clinicalFieldsUnavailable: boolean }> {
  const full = await supabase
    .from('patients')
    .select(PATIENT_SELECT_FULL)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (!full.error) {
    return { patient: (full.data as unknown as PatientRow) ?? null, clinicalFieldsUnavailable: false }
  }

  if (full.error.code !== UNDEFINED_COLUMN) {
    console.error('[ficha-dossier] patients query error:', full.error)
    throw new Error('Error al obtener los datos del paciente')
  }

  console.error(
    '[ficha-dossier] antecedentes/medicacion no disponibles (migración 042 no aplicada):',
    full.error,
  )
  const base = await supabase
    .from('patients')
    .select(PATIENT_SELECT_BASE)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (base.error) {
    console.error('[ficha-dossier] patients query error (fallback):', base.error)
    throw new Error('Error al obtener los datos del paciente')
  }

  return { patient: (base.data as unknown as PatientRow) ?? null, clinicalFieldsUnavailable: true }
}

/**
 * Tratamientos/bonos del paciente con sus sesiones (Control de sesiones) y el
 * embed reverso de treatment_plans (Tratamiento/objetivo de la cabecera). Si
 * `treatment_plans` (migración 040) no existe aún, reintenta sin ese embed.
 */
async function fetchTreatments(
  supabase: SupabaseClient,
  patientId: string,
): Promise<{ treatments: TreatmentRow[]; treatmentPlansUnavailable: boolean }> {
  const full = await supabase
    .from('treatments')
    .select(TREATMENTS_SELECT_FULL)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (!full.error) {
    return {
      treatments: (full.data ?? []) as unknown as TreatmentRow[],
      treatmentPlansUnavailable: false,
    }
  }

  console.error(
    '[ficha-dossier] treatment_plans no disponible (migración 040 no aplicada), reintentando sin el embed:',
    full.error,
  )
  const base = await supabase
    .from('treatments')
    .select(TREATMENTS_SELECT_BASE)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (base.error) {
    console.error('[ficha-dossier] treatments query error:', base.error)
    return { treatments: [], treatmentPlansUnavailable: true }
  }

  return { treatments: (base.data ?? []) as unknown as TreatmentRow[], treatmentPlansUnavailable: true }
}

/**
 * Evolución por sesión (session_notes) del paciente — incluye turnos sueltos
 * (treatment_id null). Degrada a lista vacía si la tabla (migración 041) no existe
 * o si RLS la filtra por completo (receptionist — ver nota de limitación arriba).
 */
async function fetchSessionNotes(
  supabase: SupabaseClient,
  patientId: string,
): Promise<{ notes: SessionNoteRow[]; sessionNotesUnavailable: boolean }> {
  const { data, error } = await supabase
    .from('session_notes')
    .select('session_note_id, worked_on, progress, author_id, appointments(session_index, start_at)')
    .eq('patient_id', patientId)

  if (error) {
    console.error('[ficha-dossier] session_notes no disponible (migración 041 no aplicada o RLS):', error)
    return { notes: [], sessionNotesUnavailable: true }
  }

  return { notes: (data ?? []) as unknown as SessionNoteRow[], sessionNotesUnavailable: false }
}

/**
 * Resuelve author_id → full_name para las evoluciones. Usa el cliente de service
 * role SOLO para esto: `dashboard_users` restringe SELECT a la fila propia o a admin
 * (migraciones 20260506224816 / 20260508_004) — un doctor viendo la evolución de OTRO
 * doctor no podría resolver ese nombre con el cliente autenticado. Nunca se usa para
 * leer datos clínicos, solo nombres (mismo patrón ya usado en /api/usuarios, /api/profesionales).
 * Degrada a mapa vacío (nombres "—") si el service role no está configurado — no bloqueante.
 */
async function resolveAuthorNames(authorIds: (string | null)[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const ids = [...new Set(authorIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return map

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('dashboard_users')
      .select('user_id, full_name')
      .in('user_id', ids)

    if (error) {
      console.error('[ficha-dossier] resolveAuthorNames query error:', error)
      return map
    }

    for (const row of (data ?? []) as { user_id: string; full_name: string }[]) {
      if (row.full_name) map.set(row.user_id, row.full_name)
    }
  } catch (err) {
    console.error('[ficha-dossier] resolveAuthorNames exception:', err)
  }

  return map
}

function extractSessionIndexAndDate(
  embed: SessionNoteRow['appointments'],
): { session_index: number | null; start_at: string | null } {
  const apt = Array.isArray(embed) ? (embed[0] ?? null) : embed
  return { session_index: apt?.session_index ?? null, start_at: apt?.start_at ?? null }
}

export async function getFichaDossier(
  supabase: SupabaseClient,
  patientId: string,
): Promise<FichaDossier | null> {
  const { patient, clinicalFieldsUnavailable } = await fetchPatient(supabase, patientId)
  if (!patient) return null

  const [{ treatments, treatmentPlansUnavailable }, { notes, sessionNotesUnavailable }] = await Promise.all([
    fetchTreatments(supabase, patientId),
    fetchSessionNotes(supabase, patientId),
  ])

  const authorNames = await resolveAuthorNames(notes.map((n) => n.author_id))

  const treatmentBlocks: FichaTreatmentBlock[] = treatments.map((t) => ({
    treatment_id: t.treatment_id,
    service_name: extractName(t.services),
    total_sessions: t.total_sessions,
    rows: buildSessionRows(t.total_sessions, t.appointments ?? []),
  }))

  const evolucion: FichaEvolucionRow[] = notes
    .map((n) => {
      const { session_index, start_at } = extractSessionIndexAndDate(n.appointments)
      return {
        session_note_id: n.session_note_id,
        session_index,
        start_at,
        worked_on: n.worked_on,
        progress: n.progress,
        author_name: n.author_id ? (authorNames.get(n.author_id) ?? null) : null,
      }
    })
    .sort((a, b) => {
      const da = a.start_at ? new Date(a.start_at).getTime() : 0
      const db = b.start_at ? new Date(b.start_at).getTime() : 0
      return da - db
    })

  return {
    patient: {
      patient_id: patient.patient_id,
      full_name: patient.full_name,
      dni: patient.dni,
      date_of_birth: patient.date_of_birth,
      phone_number: patient.phone_number,
      address: patient.address,
      obra_social: patient.obra_social,
      obra_social_number: patient.obra_social_number,
      reason_for_visit: patient.reason_for_visit,
      notes: patient.notes,
      antecedentes: patient.antecedentes ?? null,
      medicacion: patient.medicacion ?? null,
      cirugias: patient.cirugias ?? null,
      lugar: patient.lugar ?? null,
      ocupacion: patient.ocupacion ?? null,
      derivacion: patient.derivacion ?? null,
      actividad_fisica: patient.actividad_fisica ?? null,
      primary_professional_name: extractName(patient.professionals),
    },
    tratamientoObjetivo: pickTratamientoObjetivo(treatments),
    treatments: treatmentBlocks,
    evolucion,
    limitations: {
      clinicalFieldsUnavailable,
      treatmentPlansUnavailable,
      sessionNotesUnavailable,
    },
  }
}
