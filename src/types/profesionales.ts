// ── Story 9.3: CRUD de Profesionales ─────────────────────────────────────────
// ── Story 10.6: linked_user_email ────────────────────────────────────────────

export interface Professional {
  professional_id: string
  tenant_id: string
  name: string
  email: string
  active: boolean
  created_at: string
  services: { service_id: string; name: string }[]
  linked_user_email: string | null  // Email del usuario vinculado, null si no tiene cuenta
}

export interface ProfessionalsListResponse {
  data: Professional[]
}

export interface CreateProfessionalPayload {
  name: string
  email: string
  service_ids?: string[]
}

export interface UpdateProfessionalPayload {
  name?: string
  email?: string
  active?: boolean
}
