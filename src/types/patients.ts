import type { Appointment } from './appointments'

export interface ClinicalNote {
  note_id: string
  patient_id: string
  author_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface PatientDocument {
  document_id: string
  patient_id: string
  file_name: string
  mime_type: string
  size_bytes: number
  source: 'manual' | 'whatsapp'
  created_at: string
}

export interface Patient {
  patient_id: string
  tenant_id: string
  phone_number: string
  full_name: string
  dni: string | null
  date_of_birth: string | null
  email: string | null
  obra_social: string | null
  obra_social_number: string | null
  notes: string | null
  reason_for_visit: string | null
  alternative_phone: string | null
  address: string | null
  created_at: string
  updated_at: string
  deletion_requested_at: string | null   // ISO timestamp o null
  deletion_effective_at: string | null   // ISO timestamp o null
  // Joins vía Refine meta.select
  appointments?: Pick<Appointment, 'appointment_id' | 'start_at' | 'end_at' | 'status'>[]
  thread_states?: { status: 'active' | 'paused'; paused_reason: string | null }[]
}
