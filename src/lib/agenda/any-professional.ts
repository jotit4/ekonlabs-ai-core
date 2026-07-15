// Sentinel COMPARTIDO para "Cualquier profesional disponible" en los selects de
// profesional de NewTurnoModal / NewPaqueteModal (Pedido ISADI 2026-07-14 — el
// profesional es secundario, lo que importa es el servicio). NO es un UUID: al
// guardar se resuelve al profesional real (del hueco elegido, o server-side si
// el bono no tiene profesional fijo). Un UUID nunca contiene '_', así que el
// separador es inconfundible.
//
// Centralizado acá (en vez de redefinido por componente) para que el valor sea
// idéntico en todos los selects que lo ofrecen — aunque el string nunca viaja al
// backend (cada componente lo resuelve a `undefined`/concreto antes de enviar).
export const ANY_PROFESSIONAL = '__any__'
