'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useConversationNotes } from '@/hooks/use-conversation-notes'
import type { ConversationNote } from '@/types/conversations'

interface ConversationNotesProps {
  phone: string
  currentUserId: string
}

const MAX_CHARS = 2000

function NoteItem({
  note,
  isOwn,
  onDelete,
  isDeleting,
}: {
  note: ConversationNote
  isOwn: boolean
  onDelete: (id: string) => void
  isDeleting: boolean
}) {
  const relativeTime = (() => {
    try {
      return formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: es })
    } catch {
      return ''
    }
  })()

  return (
    <li
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 4,
          gap: 8,
        }}
      >
        <div>
          <span style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: 12 }}>
            {note.author_name ?? 'Usuario'}
          </span>
          {' · '}
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>
            {relativeTime}
          </span>
        </div>
        {isOwn && (
          <button
            type="button"
            onClick={() => onDelete(note.id)}
            disabled={isDeleting}
            aria-label="Eliminar nota"
            style={{
              background: 'none',
              border: 'none',
              cursor: isDeleting ? 'default' : 'pointer',
              color: 'var(--color-text-secondary)',
              fontSize: 11,
              padding: '0 2px',
              opacity: isDeleting ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            Borrar
          </button>
        )}
      </div>
      <p style={{ margin: 0, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {note.body}
      </p>
    </li>
  )
}

export function ConversationNotes({ phone, currentUserId }: ConversationNotesProps) {
  const { notes, isLoading, isError, addNote, isAdding, deleteNote, isDeleting } =
    useConversationNotes(phone)
  const [draft, setDraft] = useState('')

  const charsLeft = MAX_CHARS - draft.length
  const canSubmit = draft.trim().length > 0 && draft.length <= MAX_CHARS && !isAdding

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    addNote(draft.trim(), {
      onSuccess: () => setDraft(''),
    })
  }

  return (
    <section
      data-tour="conversation-notes-panel"
      aria-label="Notas internas"
      style={{
        borderTop: '1px solid var(--color-border)',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <h2
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-secondary)',
          margin: 0,
        }}
      >
        Notas internas
      </h2>

      {/* Advertencia: solo uso interno */}
      <p
        style={{
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          margin: 0,
          fontStyle: 'italic',
        }}
      >
        Estas notas son privadas y no se envían al paciente.
      </p>

      {/* Form: nueva nota */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          aria-label="Escribir nota interna"
          placeholder="Escribe una nota interna…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={MAX_CHARS}
          style={{
            width: '100%',
            resize: 'vertical',
            padding: '7px 10px',
            fontSize: 13,
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-primary)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            aria-live="polite"
            style={{
              fontSize: 11,
              color: charsLeft < 100 ? '#ff3b30' : 'var(--color-text-secondary)',
            }}
          >
            {charsLeft} caracteres restantes
          </span>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 7,
              border: '1px solid var(--color-border)',
              backgroundColor: canSubmit ? 'var(--color-interactive)' : 'var(--color-surface)',
              color: canSubmit ? '#fff' : 'var(--color-text-secondary)',
              cursor: canSubmit ? 'pointer' : 'default',
              transition: 'background-color 120ms, color 120ms',
            }}
          >
            {isAdding ? 'Guardando…' : 'Agregar nota'}
          </button>
        </div>
      </form>

      {/* Lista de notas */}
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Cargando notas…</p>
      )}
      {isError && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          No se pudieron cargar las notas.
        </p>
      )}
      {!isLoading && !isError && notes.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          Sin notas aún.
        </p>
      )}
      {!isLoading && !isError && notes.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              isOwn={note.author_user === currentUserId}
              onDelete={deleteNote}
              isDeleting={isDeleting}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
