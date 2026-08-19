// Tipos de la "Ficha kinesiológica" imprimible (réplica del papel — Fase 3).
// Contrato de salida de `getFichaDossier` (src/lib/pacientes/ficha-dossier.ts),
// consumido por `FichaImprimibleView` (src/components/pacientes/FichaImprimibleView.tsx).
//
// ⚠️ Campos del papel SIN columna en la DB (lugar, derivación, ocupación, cirugías,
// actividad física): no existen en `patients` ni en ninguna migración — quedan
// FUERA de este contrato y la vista los renderiza como "—". Ver nota en
// ficha-dossier.ts para el detalle (blocker documentado, no se agregan migraciones).

export interface FichaPatientData {
  patient_id: string
  full_name: string
  dni: string | null
  date_of_birth: string | null
  phone_number: string
  address: string | null
  obra_social: string | null
  obra_social_number: string | null
  reason_for_visit: string | null // "Diagnóstico" en el papel; en la UI se muestra "Motivo de consulta"
  notes: string | null // "Observaciones" en el papel
  antecedentes: string | null
  medicacion: string | null
  cirugias: string | null
  lugar: string | null
  ocupacion: string | null
  derivacion: string | null
  actividad_fisica: string | null
  primary_professional_name: string | null // "KLGO a cargo"
}

export interface FichaSessionRow {
  session_index: number
  start_at: string | null
  status: string | null
}

// Un bloque "Control de sesiones" = un tratamiento/bono con su grilla 1..total_sessions.
export interface FichaTreatmentBlock {
  treatment_id: string
  service_name: string | null
  total_sessions: number
  rows: FichaSessionRow[]
}

// Una fila de la tabla "Evolución por sesión" (N° / FECHA / DETALLE / LIC.).
export interface FichaEvolucionRow {
  session_note_id: string
  session_index: number | null
  start_at: string | null
  worked_on: string | null
  progress: string | null
  author_name: string | null
}

// Limitaciones de runtime detectadas al armar el dossier — migraciones HCE (040/041/042)
// que aún pueden no estar aplicadas en el entorno. La vista las muestra como aviso
// no bloqueante (no-print) en vez de romper toda la ficha.
export interface FichaLimitations {
  clinicalFieldsUnavailable: boolean // antecedentes/medicacion (042)
  treatmentPlansUnavailable: boolean // treatment_plans.objetivo (040)
  sessionNotesUnavailable: boolean // session_notes (041)
}

export interface FichaDossier {
  patient: FichaPatientData
  tratamientoObjetivo: string | null
  treatments: FichaTreatmentBlock[]
  evolucion: FichaEvolucionRow[]
  limitations: FichaLimitations
}
