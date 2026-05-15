// ── Story 9.3: CRUD de Profesionales ─────────────────────────────────────────

export interface Professional {
  professional_id: string
  tenant_id: string
  name: string
  email: string
  active: boolean
  created_at: string
  services: { service_id: string; name: string }[]
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
