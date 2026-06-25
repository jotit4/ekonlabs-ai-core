import type { UserRole } from '@/types'

/**
 * Computes the href to the patient ficha based on the current user role.
 *
 * - `doctor`             → `/pacientes/{id}?tab=notas`  (lands on clinical notes tab)
 * - any other role       → `/pacientes/{id}`            (general ficha, datos personales)
 * - null/undefined id    → `null`                       (no link should be rendered)
 *
 * The `notas` tab is gated to doctor/admin roles in the ficha page; deep-linking
 * it to a receptionist would show a blank/hidden tab. The clinical deeplink is
 * therefore exclusive to the `doctor` role.
 *
 * When `role` is null (still loading from the JWT), we return the generic path so
 * callers can render a safe fallback link without the tab deeplink.
 */
export function patientFichaHref(
  patientId: string | null | undefined,
  role: UserRole | null | undefined,
): string | null {
  if (!patientId) return null
  if (role === 'doctor') return `/pacientes/${patientId}?tab=notas`
  return `/pacientes/${patientId}`
}
