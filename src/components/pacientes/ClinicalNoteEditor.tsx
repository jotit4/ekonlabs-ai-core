'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ClinicalNote } from '@/types/patients'

interface ClinicalNoteEditorProps {
  patientId: string
  noteId?: string
  initialContent?: string
  onSaved?: (note: ClinicalNote) => void
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export function ClinicalNoteEditor({
  patientId,
  noteId,
  initialContent = '',
  onSaved,
}: ClinicalNoteEditorProps) {
  const [content, setContent] = useState(initialContent)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerSave = useCallback(async () => {
    if (!content.trim()) return
    // Cancelar debounce pendiente
    if (debounceRef.current) clearTimeout(debounceRef.current)

    setSaveStatus('saving')
    try {
      const url = noteId
        ? `/api/patients/${patientId}/clinical-notes/${noteId}`
        : `/api/patients/${patientId}/clinical-notes`
      const method = noteId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      })

      if (!res.ok) throw new Error('Save failed')

      const data = (await res.json()) as { note: ClinicalNote }
      setSaveStatus('saved')
      onSaved?.(data.note)

      // "Guardado ✓" desaparece en 2s
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    }
  }, [content, patientId, noteId, onSaved])

  // Autosave con debounce 1200ms — no llamar setState directamente en el efecto
  useEffect(() => {
    if (content === initialContent) return // No guardar si no hubo cambio
    debounceRef.current = setTimeout(() => {
      void triggerSave()
    }, 1200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const statusLabel = {
    idle: 'Se guarda automáticamente',
    pending: 'Se guarda automáticamente',
    saving: 'Guardando...',
    saved: 'Guardado ✓',
    error: 'Error al guardar',
  }[saveStatus]

  const statusColor = {
    idle: 'var(--color-text-secondary)',
    pending: 'var(--color-text-secondary)',
    saving: 'var(--color-text-secondary)',
    saved: 'var(--color-success, #34c759)',
    error: 'var(--color-error, #ff3b30)',
  }[saveStatus]

  return (
    <section aria-label="Editor de nota clínica">
      <textarea
        aria-label="Nota clínica"
        value={content}
        onChange={(e) => {
          const newValue = e.target.value
          setContent(newValue)
          // Marcar como pendiente al empezar a escribir (fuera del efecto para evitar lint)
          if (newValue !== initialContent) {
            setSaveStatus('pending')
          }
        }}
        placeholder="Escribí las notas de esta consulta..."
        style={{
          width: '100%',
          minHeight: 120,
          fontSize: 15,
          lineHeight: 1.6,
          fontFamily: 'inherit',
          border: '1px solid rgba(0,0,0,0.15)',
          borderRadius: 8,
          padding: '10px 12px',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        {/* Indicador de estado — inline, NUNCA toast */}
        <span aria-live="polite" style={{ fontSize: 13, color: statusColor, flex: 1 }}>
          {statusLabel}
        </span>

        {saveStatus === 'error' && (
          <button
            onClick={() => void triggerSave()}
            style={{
              fontSize: 13,
              color: 'var(--color-interactive, #0071e3)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Reintentar
          </button>
        )}

        <button
          onClick={() => void triggerSave()}
          disabled={!content.trim() || saveStatus === 'saving'}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            background: 'var(--color-interactive, #0071e3)',
            color: '#fff',
            fontSize: 13,
            border: 'none',
            cursor: content.trim() && saveStatus !== 'saving' ? 'pointer' : 'not-allowed',
            opacity: content.trim() && saveStatus !== 'saving' ? 1 : 0.4,
            minHeight: 44,
          }}
        >
          Guardar nota
        </button>
      </div>
    </section>
  )
}
