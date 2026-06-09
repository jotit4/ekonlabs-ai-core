'use client'

interface SesionSerieBadgeProps {
  sessionIndex: number | null | undefined
  totalSessions: number | null | undefined
}

/**
 * Indicador textual de solo lectura: marca un turno como parte de una serie
 * (paquete / tratamiento de N sesiones) — Story 13.5.
 *
 * - sin `sessionIndex` (null/undefined) → no renderiza nada (turno suelto, sin ruido visual).
 * - con `sessionIndex` pero sin `totalSessions` → "Sesión {index}" (degradado: treatment no visible).
 * - con ambos → "Sesión {index}/{total}".
 *
 * COEXISTENCIA con Epic 15: es un fragmento textual aditivo. NO lee ni modifica el
 * color de fondo de la celda (paleta por profesional = Epic 15). Estilo neutro,
 * espejo de `ReminderBadge` (var(--color-text-secondary)).
 */
export function SesionSerieBadge({ sessionIndex, totalSessions }: SesionSerieBadgeProps) {
  if (sessionIndex == null) return null

  const hasTotal = typeof totalSessions === 'number' && totalSessions > 0
  const label = hasTotal ? `Sesión ${sessionIndex}/${totalSessions}` : `Sesión ${sessionIndex}`

  return (
    <span
      aria-label={hasTotal ? `Parte de una serie: ${label}` : label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 4,
        padding: '0 5px',
        lineHeight: '16px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}
