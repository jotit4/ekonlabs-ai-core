// Grupos de recepción (services.reception_group, migración 053) — la etiqueta
// visible y el servicio principal de cada grupo son DATOS DE LA CUENTA
// (tenants.rules.reception_groups / reception_default_group, migración 069;
// ver /api/tenant/config y useTenantConfig), no nombres fijos en el código.
// Antes "Fisioterapia" era un literal (RECEPTION_FISIO_GROUP en
// NewTurnoModal, RECEPTION_GROUPS en AgendaFilters): una cuenta que no
// etiquetara sus servicios como ISADI no tenía forma de configurar el
// equivalente. Estas funciones puras resuelven esos dos datos a partir de la
// config + del catálogo de servicios activos, y las usan tanto
// AgendaFilters (solo la etiqueta) como NewTurnoModal (etiqueta + servicio
// principal).

export interface ReceptionGroupConfig {
  label: string
  main_service_id: string | null
  // Posición del botón del grupo en la agenda (menor = más a la izquierda).
  // Opcional: un grupo sin `order` va después de los que sí lo tienen.
  order?: number
}

export type ReceptionGroupsConfig = Record<string, ReceptionGroupConfig>

interface ServiceLike {
  service_id: string
  name: string
}

// Etiqueta visible de un grupo: la que configuró la cuenta o, si falta, la
// clave con la primera letra en mayúscula (nunca deja un botón/campo sin
// texto). Para ISADI hoy da lo mismo con o sin la migración 069 aplicada:
// `reception_groups.fisioterapia.label` = "Fisioterapia" y
// capitalizar('fisioterapia') también da "Fisioterapia".
export function resolveGroupLabel(groupKey: string, groups: ReceptionGroupsConfig): string {
  const configured = groups[groupKey]?.label
  if (configured && configured.trim() !== '') return configured
  if (!groupKey) return groupKey
  return groupKey.charAt(0).toUpperCase() + groupKey.slice(1)
}

// Comparación de nombres sin distinguir mayúsculas ni tildes (respaldo por
// nombre de abajo).
function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

// Servicio "principal" de un grupo — el que usan las series de sesiones
// (bono x5/x10) del flujo simplificado de recepción. Orden de resolución:
//  1. `main_service_id` configurado, si corresponde a un servicio de
//     `groupServices` (ya filtrado por reception_group + activo + booking_mode
//     'appointment' por el llamador — ver NewTurnoModal).
//  2. Respaldo por nombre: el servicio de `groupServices` cuyo nombre
//     coincide (sin mayúsculas/tildes) con la etiqueta resuelta del grupo.
//     Compatibilidad explícita para cuando el código se publica ANTES de
//     aplicar la migración de backfill (20260920120000_069) — sin
//     `reception_groups` configurado, la etiqueta cae al fallback
//     capitalizado y el respaldo por nombre igual encuentra "Fisioterapia".
//  3. `undefined` si ninguno de los dos resuelve — el llamador debe mostrar
//     un error explícito en vez de asumir un servicio.
export function resolveGroupMainService<T extends ServiceLike>(
  groupKey: string,
  groups: ReceptionGroupsConfig,
  groupServices: T[],
): T | undefined {
  const configuredId = groups[groupKey]?.main_service_id
  if (configuredId) {
    const byId = groupServices.find((s) => s.service_id === configuredId)
    if (byId) return byId
  }
  const normalizedLabel = normalizeForMatch(resolveGroupLabel(groupKey, groups))
  return groupServices.find((s) => normalizeForMatch(s.name) === normalizedLabel)
}

// Orden visible de los botones de grupo. jsonb NO conserva el orden de las
// claves de `reception_groups`, así que el orden es un dato explícito
// (`order`). Primero los grupos con `order` (ascendente); después los que no
// lo tienen, en el orden en que llegaron (`keys` = orden de aparición entre
// los servicios activos). Para ISADI la migración 069 fija 1/2/3 =
// Fisioterapia/Pileta/Pilates, el mismo orden que tenía el array fijo.
export function sortGroupKeys(keys: string[], groups: ReceptionGroupsConfig): string[] {
  const position = (key: string): number => {
    const order = groups[key]?.order
    return typeof order === 'number' && Number.isFinite(order) ? order : Number.POSITIVE_INFINITY
  }
  return keys
    .map((key, index) => ({ key, index, position: position(key) }))
    .sort((a, b) => (a.position === b.position ? a.index - b.index : a.position - b.position))
    .map((entry) => entry.key)
}
