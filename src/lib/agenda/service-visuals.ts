// Helpers visuales centralizados de la Agenda (rediseño "foco rehabilitación").
//
// Tres responsabilidades, todas determinísticas y sin estado:
//   1. isRehabService(name)  → identificar servicios del área de rehabilitación.
//   2. getServiceColor(id)    → color estable por servicio (identidad visual).
//   3. (re-export de tipos)   → para reusar en ambas vistas (Día / Semana).
//
// Se centraliza acá para que CalendarView, CalendarViewRangeReadOnly y
// AgendaFilters compartan exactamente la misma lógica.

// ─── 1. Heurística de "área rehabilitación" ───────────────────────────────────
//
// PROVISIONAL — la tabla `services` NO tiene un campo `category`/`area`. Hasta
// que exista, identificamos los servicios de rehabilitación por el NOMBRE.
// Cuando se agregue `services.category`, reemplazar el cuerpo de esta función por
// una comparación contra ese campo y borrar la regex. NO hardcodear UUIDs de
// tenant acá: la heurística debe valer para cualquier clínica.
//
// Cubre los servicios de rehab de ISADI (Fisioterapia, Kinesiología,
// Rehabilitación física, Rehabilitación traumatológica) y variantes razonables
// (fisio*, kinesi*, rehab*, "terapia física").
const REHAB_NAME_RE = /fisio|kinesi|rehab|terapia\s*f[ií]sica/i

/**
 * ¿El servicio pertenece al área de rehabilitación?
 * Heurística PROVISIONAL por nombre — ver comentario arriba.
 * Tolera `null`/`undefined` (devuelve false).
 */
export function isRehabService(name: string | null | undefined): boolean {
  if (!name) return false
  return REHAB_NAME_RE.test(name)
}

// ─── 2. Color estable por servicio ────────────────────────────────────────────
//
// Paleta de ~8 colores accesibles (contraste suficiente sobre fondo claro para
// texto/borde, y usados con alpha bajo como fondo de card). El service_id se
// hashea de forma determinística → índice en la paleta, así un mismo servicio
// siempre recibe el mismo color en cualquier vista, sin guardar estado.
const SERVICE_PALETTE = [
  '#0071e3', // azul
  '#16a34a', // verde
  '#9333ea', // violeta
  '#ea580c', // naranja
  '#0891b2', // cian
  '#db2777', // rosa/magenta
  '#ca8a04', // ámbar
  '#4f46e5', // índigo
] as const

// Color neutro de fallback cuando no hay service_id (no debería pasar, pero
// mantiene la función total).
const SERVICE_FALLBACK_COLOR = '#8e8e93'

/**
 * Hash determinístico (djb2) de un string → entero no negativo.
 * Estable entre renders y sesiones.
 */
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return hash >>> 0 // a uint32
}

/**
 * Color hex estable y determinístico para un servicio, derivado del service_id.
 * El mismo id devuelve siempre el mismo color de la paleta.
 */
export function getServiceColor(serviceId: string | null | undefined): string {
  if (!serviceId) return SERVICE_FALLBACK_COLOR
  return SERVICE_PALETTE[hashString(serviceId) % SERVICE_PALETTE.length]
}
