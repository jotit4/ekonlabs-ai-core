'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useState } from 'react'
import { ClinicalNoteEditor } from './ClinicalNoteEditor'
import type { ClinicalNote } from '@/types/patients'

interface ClinicalNotesHistoryProps {
  patientId: string
}

export function ClinicalNotesHistory({ patientId }: ClinicalNotesHistoryProps) {
  const queryClient = useQueryClient()
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)

  const { data, isPending, isError } = useQuery<{ notes: ClinicalNote[] }>({
    queryKey: ['patients', 'clinical-notes', patientId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/clinical-notes`)
      if (!res.ok) throw new Error('Error fetching notes')
      return res.json() as Promise<{ notes: ClinicalNote[] }>
    },
    staleTime: 0,
  })

  const handleNoteSaved = (note: ClinicalNote) => {
    void queryClient.invalidateQueries({ queryKey: ['patients', 'clinical-notes', patientId] })
    if (note.note_id) setEditingNoteId(null) // cerrar editor inline tras editar
  }

  // Loading
  if (isPending) {
    return (
      <section aria-label="Historial de notas clínicas">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{ height: 80, borderRadius: 8, background: '#f5f5f7', marginBottom: 12 }}
            className="animate-pulse"
          />
        ))}
      </section>
    )
  }

  // Error
  if (isError) {
    return (
      <section aria-label="Historial de notas clínicas">
        <div role="alert" style={{ color: 'var(--color-error, #ff3b30)', fontSize: 14 }}>
          Error al cargar las notas. Recargá la página.
        </div>
      </section>
    )
  }

  const notes = data?.notes ?? []

  return (
    <section aria-label="Historial de notas clínicas">
      {notes.length === 0 ? (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: 15,
            padding: '24px 0',
          }}
        >
          No hay notas para este paciente
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {notes.map((note) => (
            <li
              key={note.note_id}
              style={{
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  {format(new Date(note.created_at), 'd MMM yyyy · HH:mm', { locale: es })}
                  {note.updated_at !== note.created_at && (
                    <span style={{ marginLeft: 8, fontStyle: 'italic' }}>
                      (editado{' '}
                      {format(new Date(note.updated_at), 'd MMM · HH:mm', { locale: es })})
                    </span>
                  )}
                </span>
                <button
                  onClick={() =>
                    setEditingNoteId(editingNoteId === note.note_id ? null : note.note_id)
                  }
                  style={{
                    fontSize: 13,
                    color: 'var(--color-interactive, #0071e3)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {editingNoteId === note.note_id ? 'Cancelar' : 'Editar'}
                </button>
              </div>

              {editingNoteId === note.note_id ? (
                <ClinicalNoteEditor
                  patientId={patientId}
                  noteId={note.note_id}
                  initialContent={note.content}
                  onSaved={handleNoteSaved}
                />
              ) : (
                <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {note.content}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
