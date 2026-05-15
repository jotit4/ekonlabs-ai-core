export interface DeletionRequestRow {
  patient_id: string
  full_name: string
  dni: string | null
  deletion_requested_at: string
  deletion_effective_at: string
  status: 'pending' | 'processed'
}

export interface DeletionRequestsResponse {
  data: DeletionRequestRow[]
}
