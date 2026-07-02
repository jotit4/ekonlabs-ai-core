'use client'

import { STATUS_LEGEND_ITEMS } from '@/lib/agenda/status-colors'

/**
 * Leyenda de estados de la agenda. El color de los turnos en la grilla
 * representa el ESTADO (decisión cerrada — nunca profesional ni servicio);
 * esta leyenda hace explícito ese código de color con "pills" destacadas que
 * usan el mismo color que los chips de la grilla.
 */
export function AgendaLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mr-0.5">
        Estados
      </span>
      <ul
        aria-label="Referencia de colores por estado del turno"
        className="flex flex-wrap items-center gap-x-2 gap-y-1.5 m-0 p-0 list-none"
      >
        {STATUS_LEGEND_ITEMS.map(({ status, label, color }) => (
          <li
            key={status}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium leading-none"
            style={{
              backgroundColor: `${color}1f`,
              color: 'var(--color-text-primary)',
              boxShadow: `inset 0 0 0 1px ${color}40`,
            }}
          >
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
