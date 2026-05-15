interface KPICardProps {
  titulo: string
  valor: number | string
  subtitulo?: string
  isLoading?: boolean
}

function KPICardSkeleton() {
  return (
    <div
      className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-6 animate-pulse border border-[var(--color-border)]"
      aria-label="Cargando métrica"
      role="status"
    >
      <div className="h-3 w-1/2 rounded bg-[#ebebed] mb-3" />
      <div className="h-8 w-1/3 rounded bg-[#ebebed]" />
    </div>
  )
}

export function KPICard({ titulo, valor, subtitulo, isLoading = false }: KPICardProps) {
  if (isLoading) {
    return <KPICardSkeleton />
  }

  const formattedValor =
    typeof valor === 'number'
      ? new Intl.NumberFormat('es-AR').format(valor)
      : valor

  return (
    <div
      className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-6 border border-[var(--color-border)]"
      role="article"
    >
      <p className="text-[13px] font-normal text-[var(--color-text-secondary)] mb-2">
        {titulo}
      </p>
      <p className="text-[28px] font-semibold text-[var(--color-text-primary)] leading-tight">
        {formattedValor}
      </p>
      {subtitulo && (
        <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">
          {subtitulo}
        </p>
      )}
    </div>
  )
}
