// Definición de tours guiados por rol y pantalla (driver.js).
// Fuente de verdad: docs/onboarding/user-journeys.md
//
// Principio rector (mensaje #1 de TODO tour): el agente IA trabaja solo,
// el humano interviene por excepción.
//
// Regla de anclas: id / data-tour / aria-label — NUNCA clases de Tailwind.

import type { DriveStep } from 'driver.js'
import type { UserRole } from '@/types/index'

export interface TourDefinition {
  id: string
  role: UserRole
  /** Nombre legible de la pantalla — para accesibilidad del botón "?" */
  screen: string
  steps: DriveStep[]
}

// ─── Principio rector — primer paso de todo tour ─────────────────────────────

const PRINCIPIO_RECTOR: DriveStep = {
  popover: {
    title: 'El agente trabaja solo',
    description:
      'El agente IA hace el grueso del trabajo solo: atiende WhatsApp, agenda turnos y responde consultas. ' +
      'Vos no tenés que "operar" todo el día — entrás solo cuando aparece una señal concreta.',
  },
}

// ─── Tours del rol receptionist (journey más crítico) ────────────────────────

const RECEPTIONIST_CONVERSACIONES: TourDefinition = {
  id: 'receptionist-conversaciones',
  role: 'receptionist',
  screen: 'Conversaciones',
  steps: [
    PRINCIPIO_RECTOR,
    {
      element: '[data-tour="conversation-list"]',
      popover: {
        title: 'Tu bandeja: el semáforo',
        description:
          '🟡 Amarillo = atendé, te necesita. 🟢 Verde = el agente la maneja, no la toques. ' +
          '🔵 Azul = un humano ya tiene el control. ⚪ Gris = cerrada. ' +
          'Las más urgentes aparecen siempre arriba.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="filter-attention"]',
      popover: {
        title: 'Solo lo accionable',
        description:
          'Con este filtro ves únicamente las conversaciones que te necesitan. ' +
          'Si está en cero, el agente tiene todo bajo control.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      popover: {
        title: 'Abrí un amarillo',
        description:
          'Al abrir una conversación podés tomar el control, responder al paciente y devolverle el control al agente. ' +
          'La guía sigue dentro de la conversación (botón "?").',
      },
    },
  ],
}

const RECEPTIONIST_CONVERSACION_DETALLE: TourDefinition = {
  id: 'receptionist-conversacion-detalle',
  role: 'receptionist',
  screen: 'Conversación',
  steps: [
    {
      element: '[data-tour="takeover-btn"]',
      popover: {
        title: 'Tomá el control',
        description:
          '"Asumir control" pausa al agente y la conversación pasa a tus manos. ' +
          'No rompe nada de lo que el agente venía haciendo.',
        side: 'top',
        align: 'end',
      },
    },
    {
      element: '[data-tour="reply-input"]',
      popover: {
        title: 'Respondé al paciente',
        description:
          'Con el control tomado, escribís acá y el mensaje le llega por WhatsApp. ' +
          'Ctrl+Enter también envía.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="release-btn"]',
      popover: {
        title: 'Devolvé el control',
        description:
          'Cuando terminaste, "Liberar al agente" lo reactiva y sigue atendiendo solo.',
        side: 'top',
        align: 'end',
      },
    },
    {
      popover: {
        title: 'Corregí al agente',
        description:
          'Si el agente respondió mal algo, usá el botón "Corregir" debajo de su mensaje: ' +
          'la corrección queda guardada en su conocimiento y no vuelve a equivocarse.',
      },
    },
  ],
}

const RECEPTIONIST_AGENDA: TourDefinition = {
  id: 'receptionist-agenda',
  role: 'receptionist',
  screen: 'Calendario',
  steps: [
    {
      popover: {
        title: 'La agenda de la clínica',
        description:
          'El agente agenda solo, dentro de la disponibilidad de cada profesional. ' +
          'Vos gestionás lo presencial y telefónico: reprogramás, cancelás y agendás a mano cuando hace falta.',
      },
    },
    {
      element: '[data-tour="new-appointment-btn"]',
      popover: {
        title: 'Nuevo turno',
        description:
          'Buscá al paciente, elegí servicio + profesional y un hueco libre. ' +
          'Si el paciente no existe todavía, lo creás ahí mismo, sin salir del formulario.',
        side: 'bottom',
        align: 'end',
      },
    },
  ],
}

// ─── Registro y resolución rol + ruta → tour ─────────────────────────────────

/** Registro completo — útil para tests y para listar tours disponibles */
export const ALL_TOURS: TourDefinition[] = [
  RECEPTIONIST_CONVERSACIONES,
  RECEPTIONIST_CONVERSACION_DETALLE,
  RECEPTIONIST_AGENDA,
  // Pendiente: tours doctor (mi-agenda / mi-disponibilidad) y admin (configuración del agente)
]

/**
 * Devuelve el tour correspondiente al rol y la ruta actual, o null si no hay.
 * El botón "?" solo se muestra cuando hay tour para la pantalla actual.
 */
export function getTourForRoute(role: UserRole | null, pathname: string | null): TourDefinition | null {
  if (!role || !pathname) return null

  if (role === 'receptionist') {
    // Orden importa: el detalle matchea antes que la lista
    if (/^\/conversaciones\/[^/]+/.test(pathname)) return RECEPTIONIST_CONVERSACION_DETALLE
    if (pathname === '/conversaciones') return RECEPTIONIST_CONVERSACIONES
    if (pathname === '/agenda' || pathname.startsWith('/agenda/')) return RECEPTIONIST_AGENDA
  }

  // doctor / admin: tours aún no implementados
  return null
}
