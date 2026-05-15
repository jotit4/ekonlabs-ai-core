'use client'

export type CalendarViewType = 'dia' | 'semana' | 'mes'

interface CalendarViewSelectorProps {
  activeView: CalendarViewType
  onChange: (view: CalendarViewType) => void
}

const VIEWS: { value: CalendarViewType; label: string }[] = [
  { value: 'mes', label: 'Mes' },
  { value: 'semana', label: 'Semana' },
  { value: 'dia', label: 'Día' },
]

export function CalendarViewSelector({ activeView, onChange }: CalendarViewSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Selector de vista del calendario"
      className="flex items-center gap-1 rounded-[8px] border border-[var(--color-border)] p-0.5 bg-[var(--color-surface)]"
    >
      {VIEWS.map(({ value, label }) => {
        const isActive = activeView === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(value)}
            className={[
              'min-h-[36px] px-4 py-1.5 rounded-[6px] text-sm font-medium transition-colors duration-120',
              isActive
                ? 'bg-[var(--color-bg)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg)]/50',
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
