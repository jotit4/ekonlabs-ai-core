'use client'

import { useDistribucionServicios } from '@/hooks/use-distribucion-servicios'
import type { DistribucionServicioItem, DistribucionServiciosData } from '@/types/metricas'

interface Props {
  periodoDesde: string
  periodoHasta: string
}

export function DistribucionServiciosSection({ periodoDesde, periodoHasta }: Props) {
  const { data, isPending, isError, refetch } = useDistribucionServicios(periodoDesde, periodoHasta)

  return (
    <section aria-label="Distribución de turnos por servicio" className="mt-8">
      <h2 className="text-[18px] font-semibold text-[var(--color-text-primary)] mb-4">
        Distribución por servicio
      </h2>
      <DistribucionServiciosContent
        data={data}
        isPending={isPending}
        isError={isError}
        onRetry={() => void refetch()}
      />
    </section>
  )
}

// Componente interno separado para facilitar testing
function DistribucionServiciosContent({
  data,
  isPending,
  isError,
  onRetry,
}: {
  data: DistribucionServiciosData | null
  isPending: boolean
  isError: boolean
  onRetry: () => void
}) {
  // Estado loading — skeleton con forma de tabla (UX-DR19)
  if (isPending) {
    return (
      <div
        className="h-40 w-full animate-pulse rounded-[var(--radius-md)] bg-[#ebebed]"
        role="status"
        aria-label="Cargando distribución de servicios"
      />
    )
  }

  // Estado error
  if (isError) {
    return (
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-6 text-center border border-[var(--color-border)]">
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">
          No se pudo cargar la distribución de servicios
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-[var(--color-interactive)] hover:underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  // Estado vacío (UX-DR20)
  if (!data || data.servicios.length === 0 || data.total_turnos === 0) {
    return (
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-6 border border-[var(--color-border)]">
        <p className="text-center text-sm text-[var(--color-text-secondary)] py-4">
          Sin turnos registrados
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] overflow-x-auto">
      <table
        role="table"
        className="w-full text-sm"
        aria-label="Distribución de turnos por servicio"
      >
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th scope="col" className="text-left px-4 py-3 font-medium text-[var(--color-text-secondary)]">
              Servicio
            </th>
            <th scope="col" className="text-right px-4 py-3 font-medium text-[var(--color-text-secondary)]">
              Turnos
            </th>
            <th scope="col" className="text-right px-4 py-3 font-medium text-[var(--color-text-secondary)]">
              Porcentaje
            </th>
            <th scope="col" className="text-center px-4 py-3 font-medium text-[var(--color-text-secondary)]">
              Estado
            </th>
          </tr>
        </thead>
        <tbody>
          {data.servicios.map((item, idx) => (
            <ServicioRow key={item.service_id ?? `sin-servicio-${idx}`} item={item} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
            <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">Total</td>
            <td className="px-4 py-3 text-right font-medium text-[var(--color-text-primary)]">
              {data.total_turnos}
            </td>
            <td className="px-4 py-3 text-right font-medium text-[var(--color-text-primary)]">100%</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function ServicioRow({ item }: { item: DistribucionServicioItem }) {
  const esSinServicio = item.service_id === null

  return (
    <tr className="border-b border-[var(--color-border)] last:border-0">
      <td className="px-4 py-3 text-[var(--color-text-primary)]">
        {esSinServicio ? (
          <span className="italic text-[var(--color-text-secondary)]">{item.nombre}</span>
        ) : (
          item.nombre
        )}
      </td>
      <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">{item.total}</td>
      <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">{item.porcentaje}%</td>
      <td className="px-4 py-3 text-center">
        {item.activo ? (
          <span className="text-[var(--color-status-ok)] text-xs font-medium">Activo</span>
        ) : (
          <span className="text-[var(--color-text-secondary)] text-xs font-medium">Histórico</span>
        )}
      </td>
    </tr>
  )
}
