// Definición de tours guiados por rol y pantalla (driver.js).
// Fuente de verdad: docs/onboarding/user-journeys.md
//
// Principio rector (primer paso de TODO tour de landing): el agente IA
// trabaja solo, el humano interviene por excepción. Cada rol entra a su
// propia pantalla de inicio (/recepcion, /mi-jornada, /inicio), así que el
// principio rector vive en el tour de esa landing.
//
// Regla de anclas: id / data-tour / aria-label — NUNCA clases de Tailwind.
// Los id con punto (ej. operations_config.future_window_days) se referencian
// como [id="..."] porque en un selector CSS el punto sería una clase.

import type { DriveStep } from 'driver.js'
import type { UserRole } from '@/types/index'

export interface TourDefinition {
  id: string
  /** Roles a los que aplica este tour (un mismo tour puede servir a varios) */
  roles: UserRole[]
  /** Nombre legible de la pantalla — para accesibilidad del botón "?" */
  screen: string
  steps: DriveStep[]
}

// ─── Principio rector — variante por rol (paso 1 de cada landing) ────────────

const PRINCIPIO_RECTOR_RECEPCION: DriveStep = {
  popover: {
    title: 'El agente trabaja solo',
    description:
      'El agente IA atiende WhatsApp, agenda turnos y responde consultas sin que tengas que estar encima. ' +
      'Esta es tu pantalla de inicio: de un vistazo ves cómo viene el día y qué necesita tu atención.',
  },
}

const PRINCIPIO_RECTOR_DOCTOR: DriveStep = {
  popover: {
    title: 'El agente agenda por vos',
    description:
      'No gestionás la clínica entera: definís cuándo estás disponible y el agente llena tu agenda dentro de eso. ' +
      'Entrás a atender y a cargar la evolución de cada sesión. Esta es tu jornada de hoy.',
  },
}

const PRINCIPIO_RECTOR_ADMIN: DriveStep = {
  popover: {
    title: 'Vos supervisás, el agente opera',
    description:
      'El agente atiende y agenda solo. Tu trabajo es configurarlo, mirar los números y entrar por excepción. ' +
      'Esta pantalla es el pulso de la clínica.',
  },
}

// ─── Landings por rol ────────────────────────────────────────────────────────

const RECEPTIONIST_RECEPCION: TourDefinition = {
  id: 'receptionist-recepcion',
  roles: ['receptionist'],
  screen: 'Inicio',
  steps: [
    PRINCIPIO_RECTOR_RECEPCION,
    {
      element: '[data-tour="recepcion-conversaciones"]',
      popover: {
        title: 'Lo que te necesita, primero',
        description:
          'Acá ves cuántas conversaciones piden que entres vos. Si está en cero, el agente tiene todo bajo control. ' +
          'Tocá para ir a la bandeja.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="recepcion-acciones"]',
      popover: {
        title: 'Tus tareas de siempre',
        description:
          'Dar un turno, buscar un paciente o ver la agenda de hoy. Tres botones grandes, sin vueltas.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="topbar-inicio"]',
      popover: {
        title: 'Volvé acá cuando quieras',
        description:
          'Desde cualquier pantalla, este botón "Inicio" te trae de vuelta a este resumen.',
        side: 'bottom',
        align: 'start',
      },
    },
  ],
}

const DOCTOR_MI_JORNADA: TourDefinition = {
  id: 'doctor-mi-jornada',
  roles: ['doctor'],
  screen: 'Mi jornada',
  steps: [
    PRINCIPIO_RECTOR_DOCTOR,
    {
      element: '[data-tour="mi-jornada-proximos"]',
      popover: {
        title: 'Tus próximos turnos',
        description:
          'Quién viene ahora, en orden. Con un toque marcás si el paciente llegó.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="mi-jornada-accesos"]',
      popover: {
        title: 'Tu disponibilidad y tu agenda',
        description:
          'Acá ajustás cuándo atendés (y bloqueás vacaciones o ausencias) y abrís tu agenda completa.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="topbar-inicio"]',
      popover: {
        title: 'Volvé a tu jornada',
        description:
          'Este botón "Inicio" te trae de vuelta a esta pantalla desde donde estés.',
        side: 'bottom',
        align: 'start',
      },
    },
  ],
}

const ADMIN_INICIO: TourDefinition = {
  id: 'admin-inicio',
  roles: ['admin'],
  screen: 'Inicio',
  steps: [
    PRINCIPIO_RECTOR_ADMIN,
    {
      element: '[data-tour="inicio-pulso"]',
      popover: {
        title: 'Cómo va la clínica hoy',
        description:
          'Turnos del día, ocupación del mes, ausencias y pacientes nuevos. Un vistazo y sabés cómo viene todo.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="inicio-asistente"]',
      popover: {
        title: 'Qué hizo el asistente',
        description:
          'Cuánto resolvió el agente solo y cuántas veces necesitó a una persona. ' +
          'Si las escalaciones suben, ahí hay algo para ajustar.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="inicio-accesos"]',
      popover: {
        title: 'Métricas y configuración',
        description:
          'Desde acá entrás a los números completos y a la configuración del agente.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="topbar-inicio"]',
      popover: {
        title: 'Volvé al pulso',
        description:
          'El botón "Inicio" te trae de vuelta a este resumen desde cualquier módulo.',
        side: 'bottom',
        align: 'start',
      },
    },
  ],
}

// ─── Conversaciones (receptionist + admin) ───────────────────────────────────

const CONVERSACIONES: TourDefinition = {
  id: 'conversaciones',
  roles: ['receptionist', 'admin'],
  screen: 'Conversaciones',
  steps: [
    PRINCIPIO_RECTOR_RECEPCION,
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
      element: '[data-tour="search-conversations"]',
      popover: {
        title: 'Buscá una conversación',
        description:
          'Por nombre o teléfono, cuando necesitás a un paciente puntual.',
        side: 'bottom',
        align: 'center',
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

const CONVERSACION_DETALLE: TourDefinition = {
  id: 'conversacion-detalle',
  roles: ['receptionist', 'admin'],
  screen: 'Conversación',
  steps: [
    {
      element: '[data-tour="agent-context-panel"]',
      popover: {
        title: 'Qué entendió el agente',
        description:
          'Antes de responder, mirá acá: qué quiere el paciente, su obra social y el turno que estaba viendo. ' +
          'Te pone al día en segundos.',
        side: 'left',
        align: 'start',
      },
    },
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
      element: '[data-tour="correct-kb-btn"]',
      popover: {
        title: 'Corregí al agente',
        description:
          'Si el agente respondió mal algo, usá el botón "Corregir" debajo de su mensaje: ' +
          'la corrección queda guardada en su conocimiento y no vuelve a equivocarse.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="resolve-conversation-btn"]',
      popover: {
        title: 'Cerrá o reabrí',
        description:
          'Cuando el tema quedó resuelto, marcala como resuelta y sale de los pendientes. ' +
          'Si el paciente vuelve a escribir, podés reabrirla.',
        side: 'bottom',
        align: 'end',
      },
    },
    {
      element: '[data-tour="conversation-notes-panel"]',
      popover: {
        title: 'Notas internas',
        description:
          'Dejá una nota para el equipo: es privada, no se le envía al paciente. ' +
          'Útil para pasar contexto entre turnos.',
        side: 'left',
        align: 'start',
      },
    },
  ],
}

// ─── Agenda / Calendario (receptionist + admin) ──────────────────────────────

const AGENDA: TourDefinition = {
  id: 'agenda',
  roles: ['receptionist', 'admin'],
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

// ─── Pacientes — lista (receptionist + doctor + admin) ───────────────────────

const PACIENTES_LISTA: TourDefinition = {
  id: 'pacientes-lista',
  roles: ['receptionist', 'doctor', 'admin'],
  screen: 'Pacientes',
  steps: [
    {
      popover: {
        title: 'La ficha de cada paciente',
        description:
          'Acá está todo: datos, historial de turnos, paquetes, conversaciones y documentos. ' +
          'Cada paciente, en un solo lugar.',
      },
    },
    {
      element: '[data-tour="pacientes-search"]',
      popover: {
        title: 'Buscá un paciente',
        description: 'Por nombre, DNI o teléfono. Empezá a escribir y la lista se filtra.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="pacientes-nuevo-btn"]',
      popover: {
        title: 'Alta de paciente',
        description:
          'Con nombre y teléfono alcanza para empezar; el resto de los datos los completás después.',
        side: 'left',
        align: 'center',
      },
    },
  ],
}

// ─── Ficha del paciente — receptionist (vista administrativa) ────────────────

const PACIENTE_FICHA: TourDefinition = {
  id: 'paciente-ficha',
  roles: ['receptionist'],
  screen: 'Ficha del paciente',
  steps: [
    {
      element: '[data-tour="patient-tabs"]',
      popover: {
        title: 'Las secciones de la ficha',
        description:
          'Datos, turnos, paquetes, conversaciones y documentos. Tocá cada solapa para moverte.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      popover: {
        title: 'Editar y cargar tratamientos',
        description:
          'Desde "Editar datos" actualizás la info del paciente, y desde la solapa Paquetes ' +
          'cargás un tratamiento de varias sesiones.',
      },
    },
  ],
}

// ─── Historia clínica — doctor + admin (HCE, Epics 13/14) ────────────────────
//
// La ficha del paciente usa URL params para cambiar de pestaña (router.push con
// ?tab=...), lo que desmonta el contenido de las pestañas inactivas del DOM.
// Por eso hce-contexto-clinico, hce-nueva-nota y hce-historial-notas solo existen
// en el DOM cuando activeTab === 'notas'. Anclarlos directamente era el bug original.
//
// Fix: anclar al botón de la pestaña "notas" ([data-tab="notas"]), que siempre
// está visible en el nav tablist, y describir el contenido en el popover.

const PACIENTE_HCE: TourDefinition = {
  id: 'paciente-hce',
  roles: ['doctor', 'admin'],
  screen: 'Historia clínica',
  steps: [
    {
      // Paso 1: el nav de pestañas — siempre en el DOM
      element: '[data-tour="patient-tabs"]',
      popover: {
        title: 'Las secciones de la ficha',
        description:
          'Datos personales, historial de turnos, paquetes, conversaciones y documentos. ' +
          'Para la historia clínica completa, abrí "Notas clínicas".',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      // Paso 2: botón de la pestaña "notas" — siempre visible en el nav tablist.
      // El contenido (hce-contexto-clinico, hce-nueva-nota, hce-historial-notas)
      // solo existe en el DOM con ?tab=notas, así que se describe en el popover.
      element: '[data-tab="notas"]',
      popover: {
        title: 'Notas clínicas: la historia clínica',
        description:
          'El agente no toca esto: es tuyo. ' +
          'Acá cargás antecedentes, alergias y medicación de base, ' +
          'la evolución de cada sesión y el historial queda ordenado por fecha.',
        side: 'bottom',
        align: 'center',
      },
    },
  ],
}

// ─── Doctor — Mi disponibilidad ──────────────────────────────────────────────

const DOCTOR_MI_DISPONIBILIDAD: TourDefinition = {
  id: 'doctor-mi-disponibilidad',
  roles: ['doctor'],
  screen: 'Mi disponibilidad',
  steps: [
    {
      popover: {
        title: 'Vos marcás cuándo atendés',
        description:
          'El agente solo agenda dentro de lo que definís acá. Cuanto más claro, menos sorpresas.',
      },
    },
    {
      element: '[data-tour="disponibilidad-horarios"]',
      popover: {
        title: 'Tus horarios semanales',
        description:
          'Agregá los días y franjas en que atendés. Podés tener solo mañana, solo tarde o turno partido.',
        side: 'top',
        align: 'start',
      },
    },
    {
      element: '[data-tour="disponibilidad-bloqueos"]',
      popover: {
        title: 'Vacaciones y ausencias',
        description:
          'Bloqueá un rango de fechas y el agente no te va a agendar ahí. Ideal antes de irte unos días.',
        side: 'top',
        align: 'start',
      },
    },
  ],
}

// ─── Doctor — Mi agenda ──────────────────────────────────────────────────────

const DOCTOR_MI_AGENDA: TourDefinition = {
  id: 'doctor-mi-agenda',
  roles: ['doctor'],
  screen: 'Mi agenda',
  steps: [
    {
      popover: {
        title: 'Solo tus turnos',
        description:
          'Ves tu agenda, no la de los demás profesionales. Es por diseño: vos te enfocás en lo tuyo.',
      },
    },
    {
      element: '[data-tour="mi-agenda-calendar"]',
      popover: {
        title: 'Tu día, hora por hora',
        description: 'Cada bloque es un turno. Tocá uno para ver al paciente y abrir su ficha.',
        side: 'top',
        align: 'center',
      },
    },
  ],
}

// ─── Admin — Configuración del agente ────────────────────────────────────────
//
// Enfoque: anclar cada paso al BOTÓN DE PESTAÑA de la TabList (siempre visible),
// no a los campos internos de las pestañas (que viven dentro de TabPanel y pueden
// estar con display:none si la pestaña no está activa).
//
// El paso 2 usa onHighlightStarted para resetear a "personalidad" y garantizar
// un estado conocido al iniciar el tour.
// El paso 6 (Guardar) usa onHighlightStarted para salir de "conocimiento" si
// corresponde, ya que el botón Guardar no se renderiza en esa pestaña.

const ADMIN_CONFIG_AGENTE: TourDefinition = {
  id: 'admin-configuracion-agente',
  roles: ['admin'],
  screen: 'Configuración del agente',
  steps: [
    {
      // Paso 1: intro general — sin element
      popover: {
        title: 'Así se comporta el agente',
        description:
          'Todo lo que definás acá cambia cómo responde y qué puede hacer. ' +
          'Las cuatro pestañas cubren identidad, capacidades, conocimiento y configuración avanzada.',
      },
    },
    {
      // Paso 2: Personalidad — botón de pestaña, siempre visible en la TabList
      element: '[data-tab="personalidad"]',
      popover: {
        title: 'Nombre e identidad',
        description:
          'Definís cómo se llama el agente, con qué tono habla, su personalidad y qué debe evitar. ' +
          'Que suene a tu clínica.',
        side: 'bottom',
        align: 'start',
      },
      onHighlightStarted: () => {
        // Resetear a la primera pestaña para garantizar un estado conocido al abrir el tour
        document.querySelector<HTMLElement>('[data-tab="personalidad"]')?.click()
      },
    },
    {
      // Paso 3: Capacidades — botón de pestaña, siempre visible
      element: '[data-tab="capacidades"]',
      popover: {
        title: 'Qué puede hacer',
        description:
          'Activás o desactivás si puede agendar turnos nuevos, cancelar, ' +
          'y si requiere DNI u obra social antes de agendar.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      // Paso 4: Conocimiento — botón de pestaña, siempre visible
      element: '[data-tab="conocimiento"]',
      popover: {
        title: 'Base de conocimiento',
        description:
          'Cargá info de la clínica: precios, preparaciones para estudios, preguntas frecuentes. ' +
          'El agente la usa para responder con precisión.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      // Paso 5: Avanzado — botón de pestaña, siempre visible
      element: '[data-tab="avanzado"]',
      popover: {
        title: 'Avanzado: ventanas y Shadow Mode',
        description:
          'Configurás la anticipación mínima para reservar y hasta cuántos días hacia adelante ofrece. ' +
          'El Shadow Mode deja que el agente piense pero no le escriba al paciente: ' +
          'ideal para probar cambios sin riesgo.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      // Paso 6: Guardar — el botón NO se renderiza en la pestaña "conocimiento";
      // onHighlightStarted navega a "personalidad" si corresponde para que esté en el DOM.
      element: '[data-tour="agent-save-btn"]',
      popover: {
        title: 'Guardá los cambios',
        description:
          'Nada impacta hasta que guardás. Y si algo sale mal, tenés el historial de versiones para volver atrás.',
        side: 'top',
        align: 'end',
      },
      onHighlightStarted: () => {
        const knowledgeTab = document.querySelector('[data-tab="conocimiento"]')
        if (knowledgeTab?.getAttribute('aria-selected') === 'true') {
          // "conocimiento" activa → el botón Guardar no está en el DOM; ir a "personalidad"
          document.querySelector<HTMLElement>('[data-tab="personalidad"]')?.click()
        }
      },
    },
  ],
}

// ─── Admin — Métricas ────────────────────────────────────────────────────────

const ADMIN_METRICAS: TourDefinition = {
  id: 'admin-metricas',
  roles: ['admin'],
  screen: 'Métricas',
  steps: [
    {
      popover: {
        title: 'Los números, sin vueltas',
        description:
          'Acá ves cómo viene la clínica y cómo viene el agente, en el período que elijas.',
      },
    },
    {
      element: '[data-tour="metricas-filtro"]',
      popover: {
        title: 'Elegí el período',
        description: 'Todo lo de abajo se ajusta al rango de fechas que elijas.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="metricas-operativos"]',
      popover: {
        title: 'Lo operativo',
        description: 'Turnos, ocupación, ausencias y pacientes nuevos del período.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="metricas-agente"]',
      popover: {
        title: 'Lo del agente',
        description: 'Cuánto resolvió solo, cuánto escaló a una persona y los tiempos de respuesta.',
        side: 'top',
        align: 'center',
      },
    },
  ],
}

// ─── Admin — Usuarios ────────────────────────────────────────────────────────

const ADMIN_USUARIOS: TourDefinition = {
  id: 'admin-usuarios',
  roles: ['admin'],
  screen: 'Usuarios',
  steps: [
    {
      popover: {
        title: 'El equipo de la clínica',
        description:
          'Acá das de alta recepcionistas y profesionales, y los activás o desactivás cuando hace falta.',
      },
    },
    {
      element: '[data-tour="create-user-btn"]',
      popover: {
        title: 'Dar de alta a alguien',
        description:
          'Elegí el rol (recepción, profesional o admin) y listo. El rol define qué ve y qué puede hacer cada uno.',
        side: 'bottom',
        align: 'start',
      },
    },
  ],
}

// ─── Admin — Auditoría ───────────────────────────────────────────────────────

const ADMIN_AUDITORIA: TourDefinition = {
  id: 'admin-auditoria',
  roles: ['admin'],
  screen: 'Auditoría',
  steps: [
    {
      popover: {
        title: 'Quién hizo qué',
        description: 'Cada cambio importante queda registrado: quién, qué y cuándo.',
      },
    },
    {
      element: '#audit-filter-action',
      popover: {
        title: 'Filtrá el registro',
        description:
          'Por tipo de acción, por usuario o por rango de fechas, para encontrar exactamente lo que buscás.',
        side: 'bottom',
        align: 'start',
      },
    },
  ],
}

// ─── Admin — Servicios ───────────────────────────────────────────────────────

const ADMIN_SERVICIOS: TourDefinition = {
  id: 'admin-servicios',
  roles: ['admin'],
  screen: 'Servicios',
  steps: [
    {
      popover: {
        title: 'Los servicios de la clínica',
        description:
          'Cada servicio (kinesiología, fisioterapia, etc.) con su duración y su calendario.',
      },
    },
    {
      element: '#create-name',
      popover: {
        title: 'Crear un servicio',
        description:
          'Nombre, calendario y, si querés, el profesional. El agente solo ofrece servicios cargados acá.',
        side: 'bottom',
        align: 'start',
      },
    },
  ],
}

// ─── Admin — Profesionales ───────────────────────────────────────────────────

const ADMIN_PROFESIONALES: TourDefinition = {
  id: 'admin-profesionales',
  roles: ['admin'],
  screen: 'Profesionales',
  steps: [
    {
      popover: {
        title: 'Los profesionales',
        description:
          'Quién atiende, qué servicios da y en qué horarios. El agente agenda dentro de esa disponibilidad.',
      },
    },
    {
      element: '#create-prof-name',
      popover: {
        title: 'Alta de profesional',
        description:
          'Nombre, email y los servicios que ofrece. Después le cargás horarios y bloqueos.',
        side: 'bottom',
        align: 'start',
      },
    },
  ],
}

// ─── Registro y resolución rol + ruta → tour ─────────────────────────────────

/** Registro completo — útil para tests y para listar tours disponibles */
export const ALL_TOURS: TourDefinition[] = [
  // Landings
  RECEPTIONIST_RECEPCION,
  DOCTOR_MI_JORNADA,
  ADMIN_INICIO,
  // Compartidos receptionist + admin
  CONVERSACIONES,
  CONVERSACION_DETALLE,
  AGENDA,
  // Pacientes
  PACIENTES_LISTA,
  PACIENTE_FICHA,
  PACIENTE_HCE,
  // Doctor
  DOCTOR_MI_DISPONIBILIDAD,
  DOCTOR_MI_AGENDA,
  // Admin
  ADMIN_CONFIG_AGENTE,
  ADMIN_METRICAS,
  ADMIN_USUARIOS,
  ADMIN_AUDITORIA,
  ADMIN_SERVICIOS,
  ADMIN_PROFESIONALES,
]

/**
 * Devuelve el tour correspondiente al rol y la ruta actual, o null si no hay.
 * El botón "?" solo se muestra cuando hay tour para la pantalla actual.
 * El orden importa: las rutas más específicas se evalúan antes que las genéricas.
 */
export function getTourForRoute(role: UserRole | null, pathname: string | null): TourDefinition | null {
  if (!role || !pathname) return null

  // ── Landings por rol ──
  if (pathname === '/recepcion') return role === 'receptionist' ? RECEPTIONIST_RECEPCION : null
  if (pathname === '/mi-jornada') return role === 'doctor' ? DOCTOR_MI_JORNADA : null
  if (pathname === '/inicio') return role === 'admin' ? ADMIN_INICIO : null

  // ── Conversaciones (receptionist + admin) — el detalle matchea antes que la lista ──
  if (/^\/conversaciones\/[^/]+/.test(pathname)) {
    return role === 'receptionist' || role === 'admin' ? CONVERSACION_DETALLE : null
  }
  if (pathname === '/conversaciones') {
    return role === 'receptionist' || role === 'admin' ? CONVERSACIONES : null
  }

  // ── Agenda del doctor (antes que /agenda genérica) ──
  if (pathname === '/agenda/mi-agenda') return role === 'doctor' ? DOCTOR_MI_AGENDA : null
  if (pathname === '/agenda' || pathname.startsWith('/agenda/')) {
    return role === 'receptionist' || role === 'admin' ? AGENDA : null
  }

  // ── Disponibilidad del doctor ──
  if (pathname === '/mi-disponibilidad') return role === 'doctor' ? DOCTOR_MI_DISPONIBILIDAD : null

  // ── Pacientes — la ficha matchea antes que la lista ──
  if (/^\/pacientes\/[^/]+/.test(pathname)) {
    if (role === 'receptionist') return PACIENTE_FICHA
    if (role === 'doctor' || role === 'admin') return PACIENTE_HCE
    return null
  }
  if (pathname === '/pacientes') return PACIENTES_LISTA

  // ── Configuración y métricas (admin) ──
  if (pathname.startsWith('/configuracion/agente')) return role === 'admin' ? ADMIN_CONFIG_AGENTE : null
  if (pathname.startsWith('/configuracion/usuarios')) return role === 'admin' ? ADMIN_USUARIOS : null
  if (pathname.startsWith('/configuracion/auditoria')) return role === 'admin' ? ADMIN_AUDITORIA : null
  if (pathname.startsWith('/configuracion/servicios')) return role === 'admin' ? ADMIN_SERVICIOS : null
  if (pathname.startsWith('/configuracion/profesionales')) return role === 'admin' ? ADMIN_PROFESIONALES : null
  if (pathname === '/metricas') return role === 'admin' ? ADMIN_METRICAS : null

  return null
}
