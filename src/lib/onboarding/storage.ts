// Persistencia de "tour visto" — localStorage alcanza para MVP.
// Claves por tour id, así cada pantalla auto-dispara su tour una sola vez.

const PREFIX = 'ekonlabs:tour-seen:'

export function hasSeenTour(tourId: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(PREFIX + tourId) === '1'
  } catch {
    // localStorage bloqueado (Safari privado, etc.) → no auto-disparar
    return true
  }
}

export function markTourSeen(tourId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFIX + tourId, '1')
  } catch {
    // best-effort: si falla, el tour volverá a auto-dispararse
  }
}
