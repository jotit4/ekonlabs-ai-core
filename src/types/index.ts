export * from './patients'

export type UserRole = "receptionist" | "doctor" | "admin"

export interface JWTClaims {
  tenant_id: string
  role: UserRole
}

export interface DashboardUser {
  id: string
  user_id: string
  tenant_id: string
  role: UserRole
  is_active: boolean
  full_name: string
  email: string
  created_at: string
  updated_at: string
}

export interface DashboardUserWithEmail extends DashboardUser {
  email: string
}

export interface CreateUserPayload {
  email: string
  full_name: string
  role: 'receptionist' | 'doctor'
}

export interface ToggleUserStatusPayload {
  is_active: boolean
}
