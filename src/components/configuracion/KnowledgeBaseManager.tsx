'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import {
  useKnowledgeTopics,
  useReindexTopic,
  useDeleteTopic,
} from '@/hooks/use-knowledge-topics'
import {
  CreateKnowledgeSchema,
  type CreateKnowledgeFormValues,
} from '@/lib/schemas/agente.schema'
import type { KnowledgeTopic } from '@/types/agente'

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

const MAX_CONTENT_CHARS = 10000

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
  const { topics, isPending, isError, refetch } = useKnowledgeTopics()
  const reindexMutation = useReindexTopic()
  const deleteMutation = useDeleteTopic()

  const [editingSource, setEditingSource] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [confirmingDeleteSource, setConfirmingDeleteSource] = useState<string | null>(null)

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

  const onCreate = (data: CreateKnowledgeFormValues) => {
    const source = data.source_filename?.trim() || 'general'
    reindexMutation.mutate(
      { source, content: data.content.trim() },
      { onSuccess: () => reset({ content: '', source_filename: '' }) },
    )
  }

  const startEdit = (topic: KnowledgeTopic) => {
    setConfirmingDeleteSource(null)
    setEditingSource(topic.source_filename)
    setEditContent(topic.content)
  }

  const cancelEdit = () => {
    setEditingSource(null)
    setEditContent('')
  }

  const saveEdit = (source: string) => {
    reindexMutation.mutate(
      { source, content: editContent.trim() },
      { onSuccess: () => cancelEdit() },
    )
  }

  const confirmDelete = (source: string) => {
    deleteMutation.mutate(source, {
      onSuccess: () => setConfirmingDeleteSource(null),
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
          Lo que el agente sabe y consulta para responder. Cada tema agrupa el texto
          completo; editarlo o borrarlo reemplaza todo el tema.
        </p>
      </div>

      {/* ── Crear tema nuevo ────────────────────────────────────────────── */}
      {canEdit && (
        <form onSubmit={handleSubmit(onCreate)} noValidate className="space-y-3">
          <legend className={sectionTitleClass}>Agregar tema nuevo</legend>

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
            disabled={reindexMutation.isPending}
            className={`${primaryButtonClass} ${reindexMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {reindexMutation.isPending ? 'Agregando...' : 'Agregar tema'}
          </button>
        </form>
      )}

      {/* ── Lista de temas ──────────────────────────────────────────────── */}
      {topics.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)] italic">
          Todavía no hay temas en la base de conocimiento.
        </p>
      ) : (
        <ul className="space-y-2">
          {topics.map((topic) => (
            <li
              key={topic.source_filename}
              className="rounded-[8px] border border-[var(--color-border)] p-3"
            >
              {editingSource === topic.source_filename ? (
                <div className="space-y-3">
                  <h3 className={sectionTitleClass}>{topic.source_filename}</h3>
                  <textarea
                    aria-label="Editar contenido del tema"
                    rows={6}
                    maxLength={MAX_CONTENT_CHARS}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className={`${inputClass} resize-vertical`}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(topic.source_filename)}
                      disabled={reindexMutation.isPending || editContent.trim().length === 0}
                      className={`${primaryButtonClass} ${reindexMutation.isPending || editContent.trim().length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {reindexMutation.isPending ? 'Guardando...' : 'Guardar'}
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
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className={sectionTitleClass}>{topic.source_filename}</h3>
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {topic.chunk_count} {topic.chunk_count === 1 ? 'fragmento' : 'fragmentos'}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
                    {topic.content}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {formatDate(topic.updated_at)}
                    </span>
                    {canEdit && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(topic)}
                          className="text-sm font-medium text-[var(--color-interactive)] hover:underline"
                        >
                          Editar
                        </button>
                        {confirmingDeleteSource === topic.source_filename ? (
                          <>
                            <button
                              type="button"
                              onClick={() => confirmDelete(topic.source_filename)}
                              disabled={deleteMutation.isPending}
                              className={`text-sm font-medium text-red-600 hover:underline ${deleteMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {deleteMutation.isPending ? 'Borrando...' : 'Confirmar borrado'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteSource(null)}
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
                              setConfirmingDeleteSource(topic.source_filename)
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
      )}
    </section>
  )
}
