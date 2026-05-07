export type UserRole = "receptionist" | "doctor" | "admin"

export interface JWTClaims {
  tenant_id: string
  role: UserRole
}
