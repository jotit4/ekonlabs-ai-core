// Paleta MUDA del turnero — pedido real del cliente ISADI (2026-07-14).
//
// La recepcionista elige a mano el color de un turno usando EXACTAMENTE los
// colores de su turnero Excel actual. El significado de cada color lo decide
// ella sola: el sistema NO le impone ninguna semántica (no hay labels, no hay
// mapeo a estado/servicio/profesional). Por eso esto es solo una paleta de
// hex — sin un enum de "significados".
//
// Los 16 valores salen del XML del .xlsx original, en el orden de uso real.
// NO CAMBIAR NI UN DÍGITO. Se descartaron 3 colores marginales del archivo
// original (#FAC090, #C6D9F1, #92D050) por indicación explícita del cliente.
export const TURNERO_PALETTE = [
  '#00FFFF',
  '#00FF00',
  '#FFC000',
  '#FFFF00',
  '#B9CDE5',
  '#CCC1DA',
  '#CC00FF',
  '#E6B9B8',
  '#00FF99',
  '#CC00CC',
  '#FDEADA',
  '#FFCC00',
  '#F030D9',
  '#FF66CC',
  '#66FFFF',
  '#FF0000',
] as const

export type TurneroPaletteColor = (typeof TURNERO_PALETTE)[number]

// Mismo formato que exige el CHECK de la columna `appointments.color`
// (migración 051): hex de 6 dígitos, con `#`. Se valida el FORMATO, no que el
// valor pertenezca a la paleta — la paleta es solo lo que ofrece el selector;
// el backend acepta cualquier hex válido (más flexible a futuro, mismo criterio
// que el resto del código para "es un color hex").
export const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_REGEX.test(value)
}

// ─── Legibilidad del texto sobre un color de fondo saturado ───────────────────
// Los colores del Excel son muy saturados (cian puro, amarillo puro, magenta
// puro, etc.) — no alcanza con un solo color de texto fijo. Se calcula la
// luminancia relativa (fórmula WCAG 2.x, sRGB con corrección gamma) y se
// elige el texto oscuro o claro con mejor contraste. El umbral 0.179 es el
// punto exacto donde el contraste contra negro (#000) y contra blanco (#fff)
// se cruzan — por encima, negro contrasta mejor; por debajo, blanco.
const LUMINANCE_THRESHOLD = 0.179

const DARK_TEXT = '#141414'
const LIGHT_TEXT = '#ffffff'

function srgbChannelToLinear(channel8bit: number): number {
  const c = channel8bit / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  )
}

/**
 * Color de texto legible sobre un fondo hex dado (#RRGGBB). Devuelve un hex
 * SÓLIDO — nunca opacidad — para no desvirtuar el color de fondo elegido por
 * la recepcionista. Si `hex` no es un color válido, cae a un gris oscuro
 * seguro (fallback defensivo; no debería ocurrir con valores ya validados).
 */
export function getReadableTextColor(hex: string): string {
  if (!isValidHexColor(hex)) return DARK_TEXT
  return relativeLuminance(hex) > LUMINANCE_THRESHOLD ? DARK_TEXT : LIGHT_TEXT
}
