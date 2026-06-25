import type { UserRole } from '@/types/index'

/**
 * Landing principal de cada rol — ÚNICA FUENTE DE VERDAD.
 * Cada rol entra directo a la pantalla que más usa, sin pasar por la agenda.
 *
 * Usada por:
 *  - src/app/page.tsx           → redirect por rol tras login
 *  - src/components/AppSidebar   → ítem "Inicio" del menú lateral / bottom-nav
 *  - src/components/AppTopbar    → botón "Inicio" de la barra superior
 *
 * Para sumar o cambiar un landing, tocar SOLO este archivo.
 */
export const LANDING_BY_ROLE: Record<UserRole, string> = {
  receptionist: '/recepcion', // recepción no técnica → "Modo recepción"
  doctor: '/mi-jornada',      // profesional → su jornada clínica del día
  admin: '/inicio',           // dueño/admin → pulso del negocio + su agenda
}

/** A dónde mandar si el JWT no trae un rol válido (caso borde). */
export const FALLBACK_LANDING = '/agenda'

/** Landing del rol, con fallback seguro. */
export function landingForRole(role: UserRole | undefined | null): string {
  return (role && LANDING_BY_ROLE[role]) || FALLBACK_LANDING
}
