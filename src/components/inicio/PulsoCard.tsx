'use client'

import Link from 'next/link'

export type PulsoTono = 'interactive' | 'ok' | 'warn'

const TONO_CLASES: Record<PulsoTono, string> = {
  interactive: 'bg-[var(--color-interactive)]/12 text-[var(--color-interactive)]',
  ok: 'bg-[var(--color-status-ok)]/15 text-[var(--color-status-ok)]',
  warn: 'bg-[var(--color-status-warn)]/15 text-[var(--color-status-warn)]',
}

export interface PulsoCardProps {
  icono: React.ReactNode
  tono: PulsoTono
  valor: number | string
  titulo: string
  ayuda: string
  /** Si se pasa, la tarjeta se convierte en enlace navegable */
  href?: string
}

const BASE_CLASSES =
  'flex min-h-[44px] h-full items-center gap-4 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4'

const HOVER_CLASSES =
  'transition-all hover:-translate-y-0.5 hover:border-[var(--color-interactive)] hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-interactive)]/30'

export function PulsoCard({ icono, tono, valor, titulo, ayuda, href }: PulsoCardProps) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className={[
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
          TONO_CLASES[tono],
        ].join(' ')}
      >
        {icono}
      </span>
      <div className="min-w-0">
        <p className="text-[26px] font-bold leading-none text-[var(--color-text-primary)]">
          {valor}
        </p>
        <p className="mt-1.5 text-[14px] font-medium leading-tight text-[var(--color-text-primary)]">
          {titulo}
        </p>
        <p className="mt-0.5 text-[12px] leading-tight text-[var(--color-text-secondary)]">
          {ayuda}
        </p>
      </div>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={`${BASE_CLASSES} ${HOVER_CLASSES}`}>
        {inner}
      </Link>
    )
  }

  return <div className={BASE_CLASSES}>{inner}</div>
}
