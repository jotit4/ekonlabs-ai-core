'use client'

import { TURNERO_PALETTE, getReadableTextColor } from '@/lib/agenda/turnero-palette'

// ─── Selector MUDO de color del turno (pedido ISADI 2026-07-14) ──────────────
// Grilla de los 16 colores EXACTOS del turnero Excel + "Sin color". Sin
// etiquetas de significado: el color lo interpreta solamente la recepcionista.
// El swatch pinta el hex PURO (sin opacidad) — el cliente pidió "los mismos
// colores, no parecidos". Usado tanto al crear el turno (NewTurnoModal) como
// al editarlo después (TurnoDetailModal).

const SWATCH_SIZE = 44 // mínimo táctil

interface ColorSwatchPickerProps {
  value: string | null
  onChange: (color: string | null) => void
  disabled?: boolean
  label?: string
}

export function ColorSwatchPicker({
  value,
  onChange,
  disabled = false,
  label = 'Color del turno',
}: ColorSwatchPickerProps) {
  return (
    <div>
      <span className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
      >
        {/* "Sin color" — el turno vuelve a verse neutro (comportamiento por defecto) */}
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-pressed={value === null}
          aria-label="Sin color"
          title="Sin color"
          style={{
            width: SWATCH_SIZE,
            height: SWATCH_SIZE,
            borderRadius: 8,
            border: value === null
              ? '3px solid var(--color-interactive)'
              : '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            color: 'var(--color-text-secondary)',
            opacity: disabled ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>

        {TURNERO_PALETTE.map((color) => {
          const selected = value === color
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`Color ${color}`}
              title={color}
              style={{
                width: SWATCH_SIZE,
                height: SWATCH_SIZE,
                borderRadius: 8,
                border: selected
                  ? '3px solid var(--color-interactive)'
                  : '1px solid rgba(0,0,0,0.15)',
                background: color,
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.5 : 1,
                flexShrink: 0,
                boxSizing: 'border-box',
              }}
            >
              {selected && (
                <span
                  aria-hidden="true"
                  style={{ color: getReadableTextColor(color), fontSize: 18, fontWeight: 700 }}
                >
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
