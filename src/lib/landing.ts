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

/**
 * Ruta "padre" de una ruta, para el botón "Volver" de AppTopbar.
 * Deriva por ESTRUCTURA DE PATHNAME ("subir un nivel"), no por history —
 * evita que módulos que empujan estado al historial (ej. Agenda con
 * fecha/vista/service_id como query/entries) hagan que "atrás" recorra
 * esos estados intermedios en vez de ir al módulo anterior.
 *
 * Reglas:
 *  - En el propio landing del rol → no hay padre (null): no hay a dónde subir.
 *  - Subruta de un módulo (ej. "/pacientes/123", "/configuracion/agente")
 *    → la raíz de ese módulo ("/pacientes", "/configuracion").
 *  - Un módulo raíz (ej. "/agenda", "/conversaciones", "/recepcion")
 *    → el landing del rol.
 *
 * Usada por src/components/AppTopbar.tsx.
 */
export function getParentPath(pathname: string, homeHref: string): string | null {
  if (pathname === homeHref) return null

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null
  if (segments.length === 1) return homeHref
  return `/${segments[0]}`
}
