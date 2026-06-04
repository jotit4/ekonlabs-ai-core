'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useKnowledge } from '@/hooks/use-knowledge'
import {
  useCreateKnowledge,
  useUpdateKnowledge,
  useDeleteKnowledge,
} from '@/hooks/use-knowledge-mutations'
import {
  CreateKnowledgeSchema,
  type CreateKnowledgeFormValues,
} from '@/lib/schemas/agente.schema'
import type { KnowledgeEntry } from '@/types/agente'

const inputClass =
  'w-full px-3 py-2 rounded-[8px] border border-[var(--color-border)] text-sm bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]'

const labelClass = 'block text-sm font-medium text-[var(--color-text-primary)] mb-1'

const sectionTitleClass =
  'text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]'

const primaryButtonClass = [
  'px-4 py-2 rounded-[8px] text-sm font-medium',
  'bg-[var(--color-interactive)] text-white',
  'hover:opacity-90 transition-opacity min-h-[44px]',
].join(' ')

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface KnowledgeBaseManagerProps {
  /** Si false (rol doctor), se ocultan las acciones de escritura (sólo lectura). */
  canEdit?: boolean
}

export function KnowledgeBaseManager({ canEdit = true }: KnowledgeBaseManagerProps) {
  const { entries, isPending, isError, refetch } = useKnowledge()
  const createMutation = useCreateKnowledge()
  const updateMutation = useUpdateKnowledge()
  const deleteMutation = useDeleteKnowledge()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editSource, setEditSource] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateKnowledgeFormValues>({
    resolver: standardSchemaResolver(CreateKnowledgeSchema),
    defaultValues: { content: '', source_filename: '' },
  })

  const contentValue = watch('content') ?? ''

  // Agrupar entradas por tema (source_filename).
  const groups = useMemo(() => {
    const map = new Map<string, KnowledgeEntry[]>()
    for (const entry of entries) {
      const key = entry.source_filename || 'general'
      const list = map.get(key) ?? []
      list.push(entry)
      map.set(key, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [entries])

  const onCreate = (data: CreateKnowledgeFormValues) => {
    createMutation.mutate(
      { content: data.content, source_filename: data.source_filename || undefined },
      { onSuccess: () => reset({ content: '', source_filename: '' }) },
    )
  }

  const startEdit = (entry: KnowledgeEntry) => {
    setConfirmingDeleteId(null)
    setEditingId(entry.id)
    setEditContent(entry.content)
    setEditSource(entry.source_filename || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditContent('')
    setEditSource('')
  }

  const saveEdit = (id: string) => {
    updateMutation.mutate(
      {
        id,
        content: editContent.trim(),
        source_filename: editSource.trim() || 'general',
      },
      { onSuccess: () => cancelEdit() },
    )
  }

  const confirmDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => setConfirmingDeleteId(null),
    })
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isPending) {
    return (
      <section aria-label="Base de conocimiento del agente" className="space-y-4">
        <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
          Base de conocimiento del agente
        </h2>
        <div
          role="status"
          aria-label="Cargando base de conocimiento"
          className="space-y-3 animate-pulse"
        >
          <div className="h-20 rounded-[8px] bg-[var(--color-surface)]" />
          <div className="h-20 rounded-[8px] bg-[var(--color-surface)]" />
        </div>
      </section>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <section aria-label="Base de conocimiento del agente" className="space-y-4">
        <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
          Base de conocimiento del agente
        </h2>
        <div
          role="alert"
          className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between"
        >
          <p className="text-sm text-red-700">
            Error al cargar la base de conocimiento.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-medium text-[var(--color-interactive)] hover:underline ml-4"
          >
            Reintentar
          </button>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Base de conocimiento del agente" className="space-y-6">
      <div>
        <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
          Base de conocimiento del agente
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Lo que el agente sabe y consulta para responder. Agregá datos o respuestas
          en lenguaje natural; agrupalas por tema.
        </p>
      </div>

      {/* ── Crear entrada ───────────────────────────────────────────────── */}
      {canEdit && (
        <form onSubmit={handleSubmit(onCreate)} noValidate className="space-y-3">
          <legend className={sectionTitleClass}>Agregar entrada</legend>

          <div>
            <label htmlFor="kb-content" className={labelClass}>Contenido</label>
            <textarea
              id="kb-content"
              rows={4}
              maxLength={5000}
              {...register('content')}
              className={`${inputClass} resize-vertical`}
              placeholder="Ej: La obra social OSDE se acepta para todas las prestaciones..."
              aria-invalid={!!errors.content}
            />
            <p className="text-xs text-[var(--color-text-secondary)] text-right">
              {contentValue.length}/5000
            </p>
            {errors.content && (
              <p role="alert" className="mt-1 text-xs text-red-600">{errors.content.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="kb-source" className={labelClass}>Tema (opcional)</label>
            <input
              id="kb-source"
              type="text"
              maxLength={120}
              {...register('source_filename')}
              className={inputClass}
              placeholder="Ej: obras-sociales (por defecto: general)"
              aria-invalid={!!errors.source_filename}
            />
            {errors.source_filename && (
              <p role="alert" className="mt-1 text-xs text-red-600">{errors.source_filename.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={createMutation.isPending}
            className={`${primaryButtonClass} ${createMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {createMutation.isPending ? 'Agregando...' : 'Agregar entrada'}
          </button>
        </form>
      )}

      {/* ── Lista agrupada ──────────────────────────────────────────────── */}
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)] italic">
          Todavía no hay entradas en la base de conocimiento.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(([tema, temaEntries]) => (
            <div key={tema} className="space-y-2">
              <h3 className={sectionTitleClass}>{tema}</h3>
              <ul className="space-y-2">
                {temaEntries.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-[8px] border border-[var(--color-border)] p-3"
                  >
                    {editingId === entry.id ? (
                      <div className="space-y-3">
                        <textarea
                          aria-label="Editar contenido"
                          rows={4}
                          maxLength={5000}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className={`${inputClass} resize-vertical`}
                        />
                        <input
                          aria-label="Editar tema"
                          type="text"
                          maxLength={120}
                          value={editSource}
                          onChange={(e) => setEditSource(e.target.value)}
                          className={inputClass}
                          placeholder="Tema"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => saveEdit(entry.id)}
                            disabled={updateMutation.isPending || editContent.trim().length === 0}
                            className={`${primaryButtonClass} ${updateMutation.isPending || editContent.trim().length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-4 py-2 rounded-[8px] text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-primary)] min-h-[44px]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
                          {entry.content}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            {formatDate(entry.created_at)}
                          </span>
                          {canEdit && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(entry)}
                                className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
                              >
                                Editar
                              </button>
                              {confirmingDeleteId === entry.id ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => confirmDelete(entry.id)}
                                    disabled={deleteMutation.isPending}
                                    className={`text-sm font-medium text-red-600 hover:underline ${deleteMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  >
                                    {deleteMutation.isPending ? 'Borrando...' : 'Confirmar borrado'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmingDeleteId(null)}
                                    className="text-sm text-[var(--color-text-secondary)] hover:underline"
                                  >
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    cancelEdit()
                                    setConfirmingDeleteId(entry.id)
                                  }}
                                  className="text-sm font-medium text-red-600 hover:underline"
                                >
                                  Borrar
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
