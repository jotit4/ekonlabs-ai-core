/**
 * Genera slots de tiempo en formato HH:MM desde las 08:00 hasta las 20:00
 * con incrementos de durationMinutes minutos.
 */
export function generateTimeSlots(durationMinutes: number): string[] {
  const slots: string[] = []
  let current = 8 * 60  // 08:00 en minutos
  const limit = 20 * 60 // 20:00

  while (current + durationMinutes <= limit) {
    const hh = Math.floor(current / 60).toString().padStart(2, '0')
    const mm = (current % 60).toString().padStart(2, '0')
    slots.push(`${hh}:${mm}`)
    current += durationMinutes
  }
  return slots
}
