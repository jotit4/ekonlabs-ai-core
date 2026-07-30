export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires'

const argentinaDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ARGENTINA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Devuelve la fecha calendario vigente en Argentina como YYYY-MM-DD. */
export function getArgentinaToday(date = new Date()): string {
  const parts = Object.fromEntries(
    argentinaDateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `${parts.year}-${parts.month}-${parts.day}`
}
