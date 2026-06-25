'use client'

import { useState, Fragment } from 'react'
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
import type { ReactNode } from 'react'

// ── Style tokens ──────────────────────────────────────────────────────────────

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

// ── Utility helpers ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Convierte un source_filename a nombre legible SOLO para presentación.
 * Quita extensión (.md/.txt), reemplaza _/- por espacios, capitaliza como frase.
 * El source_filename REAL no cambia; la API lo sigue usando sin transformar.
 *
 * Ej: INFO_GENERAL.MD → "Info general" · obras-sociales → "Obras sociales"
 */
export function prettyTopicName(source: string): string {
  const withoutExt = source.replace(/\.[a-zA-Z]{1,4}$/, '')
  const withSpaces = withoutExt.replace(/[_-]+/g, ' ')
  const collapsed = withSpaces.replace(/\s+/g, ' ').trim()
  if (!collapsed) return source
  return collapsed.charAt(0).toUpperCase() + collapsed.slice(1).toLowerCase()
}

/**
 * Extrae la primera línea no vacía del contenido, eliminando símbolos markdown.
 * Máximo `maxLen` caracteres; agrega '…' si trunca.
 */
export function summaryLine(content: string, maxLen = 90): string {
  for (const line of content.split('\n')) {
    const stripped = line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/^>\s*/, '')
      .trim()
    if (stripped) {
      return stripped.length > maxLen ? stripped.slice(0, maxLen) + '…' : stripped
    }
  }
  return ''
}

/**
 * Renderiza inline: **negrita** → <strong>.
 * Sin dangerouslySetInnerHTML.
 */
function renderInline(text: string, keyPrefix: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <Fragment>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      )}
    </Fragment>
  )
}

/**
 * Mini-parser de markdown → JSX. Sin dangerouslySetInnerHTML.
 * Cubre: #/##/### headings, **negrita**, listas con -, párrafos con saltos de línea.
 */
function renderMarkdown(text: string): ReactNode {
  const nodes: ReactNode[] = []
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Línea vacía → separador de bloque (space-y-2 en el wrapper lo maneja)
    if (line.trim() === '') {
      i++
      continue
    }

    // Encabezado #, ##, ###
    const hMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (hMatch) {
      const level = hMatch[1].length
      const cls =
        level === 1
          ? 'text-base font-bold text-[var(--color-text-primary)]'
          : level === 2
            ? 'text-sm font-bold text-[var(--color-text-primary)]'
            : 'text-sm font-semibold text-[var(--color-text-primary)]'
      nodes.push(
        <div key={`h-${i}`} className={cls}>
          {renderInline(hMatch[2], `h-${i}`)}
        </div>,
      )
      i++
      continue
    }

    // Lista: acumular ítems consecutivos (- o * o +)
    if (/^\s*[-*+]\s/.test(line)) {
      const items: string[] = []
      const startIdx = i
      while (
        i < lines.length &&
        (/^\s*[-*+]\s/.test(lines[i]) || lines[i].trim() === '')
      ) {
        if (lines[i].trim() !== '') {
          items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        }
        i++
      }
      nodes.push(
        <ul
          key={`ul-${startIdx}`}
          className="list-disc pl-5 space-y-0.5 text-sm text-[var(--color-text-primary)]"
        >
          {items.map((item, li) => (
            <li key={li}>{renderInline(item, `ul-${startIdx}-${li}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // Párrafo regular: acumular líneas hasta vacía, encabezado o lista
    const paraLines: string[] = []
    const paraStart = i
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,3}\s/) &&
      !/^\s*[-*+]\s/.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      nodes.push(
        <p key={`p-${paraStart}`} className="text-sm text-[var(--color-text-primary)]">
          {paraLines.map((pl, li) => (
            <span key={li}>
              {li > 0 && <br />}
              {renderInline(pl, `p-${paraStart}-${li}`)}
            </span>
          ))}
        </p>,
      )
    }
  }

  return <div className="space-y-2">{nodes}</div>
}

/** Sanitiza source_filename para uso como parte de un ID HTML. */
function toHtmlId(source: string): string {
  return `kb-${source.replace(/[^a-zA-Z0-9-_]/g, '_')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface KnowledgeBaseManagerProps {
  /** Si false (rol doctor), se ocultan las acciones de escritura (sólo lectura). */
  canEdit?: boolean
}

export function KnowledgeBaseManager({ canEdit = true }: KnowledgeBaseManagerProps) {
  const { topics, isPending, isError, refetch } = useKnowledgeTopics()
  const reindexMutation = useReindexTopic()
  const deleteMutation = useDeleteTopic()

  // Acordeón: qué temas están expandidos (todos cerrados al inicio)
  const [openTopics, setOpenTopics] = useState<Record<string, boolean>>({})
  // Edición inline
  const [editingSource, setEditingSource] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  // Borrado en 2 pasos
  const [confirmingDeleteSource, setConfirmingDeleteSource] = useState<string | null>(null)
  // Red de seguridad: si el source ya existe, pedir confirmación antes de reemplazar
  const [pendingCreate, setPendingCreate] = useState<{
    source: string
    content: string
  } | null>(null)

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

  const toggleTopic = (source: string) => {
    setOpenTopics((prev) => ({ ...prev, [source]: !prev[source] }))
  }

  const onCreate = (data: CreateKnowledgeFormValues) => {
    const source = data.source_filename?.trim() || 'general'
    const content = data.content.trim()
    const isDuplicate = topics.some(
      (t) => t.source_filename.toLowerCase() === source.toLowerCase(),
    )
    if (isDuplicate) {
      setPendingCreate({ source, content })
      return
    }
    reindexMutation.mutate(
      { source, content },
      { onSuccess: () => reset({ content: '', source_filename: '' }) },
    )
  }

  const confirmCreate = () => {
    if (!pendingCreate) return
    reindexMutation.mutate(pendingCreate, {
      onSuccess: () => {
        reset({ content: '', source_filename: '' })
        setPendingCreate(null)
      },
    })
  }

  const startEdit = (topic: KnowledgeTopic) => {
    setConfirmingDeleteSource(null)
    setEditingSource(topic.source_filename)
    setEditContent(topic.content)
    // Abrir el acordeón para que la edición sea visible
    setOpenTopics((prev) => ({ ...prev, [topic.source_filename]: true }))
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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isPending) {
    return (
      <section aria-label="Base de conocimiento del agente" className="space-y-4">
        <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
          Qué sabe tu asistente
        </h2>
        <div
          role="status"
          aria-label="Cargando base de conocimiento"
          className="space-y-3 animate-pulse"
        >
          <div className="h-12 rounded-[8px] bg-[var(--color-surface)]" />
          <div className="h-12 rounded-[8px] bg-[var(--color-surface)]" />
        </div>
      </section>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <section aria-label="Base de conocimiento del agente" className="space-y-4">
        <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
          Qué sabe tu asistente
        </h2>
        <div
          role="alert"
          className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between"
        >
          <p className="text-sm text-red-700">Error al cargar la base de conocimiento.</p>
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
          Qué sabe tu asistente{topics.length > 0 ? ` (${topics.length})` : ''}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Información que el agente consulta para responder mejor a tus pacientes. Podés
          agregar temas como obras sociales aceptadas, horarios especiales, servicios o
          preguntas frecuentes. Al editar o borrar un tema, se actualiza su contenido completo.
        </p>
      </div>

      {/* ── Crear tema nuevo ──────────────────────────────────────────────── */}
      {canEdit && (
        <form onSubmit={handleSubmit(onCreate)} noValidate className="space-y-3">
          <legend className={sectionTitleClass}>Agregar tema nuevo</legend>

          <div>
            <label htmlFor="kb-content" className={labelClass}>
              Contenido
            </label>
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
              <p role="alert" className="mt-1 text-xs text-red-600">
                {errors.content.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="kb-source" className={labelClass}>
              Tema (opcional)
            </label>
            <input
              id="kb-source"
              type="text"
              maxLength={120}
              {...register('source_filename')}
              className={inputClass}
              placeholder="Ej: Obras sociales, Horarios, FAQ... (por defecto: general)"
              aria-invalid={!!errors.source_filename}
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Un nombre para identificar este bloque de información. Si lo dejás vacío se
              guarda como &ldquo;general&rdquo;.
            </p>
            {errors.source_filename && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {errors.source_filename.message}
              </p>
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

      {/* ── Red de seguridad: confirmar reemplazo de tema existente ──────── */}
      {pendingCreate && (
        <div
          role="alertdialog"
          aria-label="Confirmar reemplazo de tema"
          className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 space-y-3"
        >
          <p className="text-sm text-amber-800">
            Ya existe un tema llamado{' '}
            <strong>&ldquo;{prettyTopicName(pendingCreate.source)}&rdquo;</strong>.
            ¿Reemplazar su contenido?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmCreate}
              disabled={reindexMutation.isPending}
              className={`px-4 py-2 rounded-[8px] text-sm font-medium bg-amber-600 text-white hover:opacity-90 transition-opacity min-h-[40px] ${reindexMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {reindexMutation.isPending ? 'Reemplazando...' : 'Sí, reemplazar'}
            </button>
            <button
              type="button"
              onClick={() => setPendingCreate(null)}
              className="px-4 py-2 rounded-[8px] text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-primary)] min-h-[40px]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Lista de temas (acordeón) ─────────────────────────────────────── */}
      {topics.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)] italic">
          Todavía no hay temas en la base de conocimiento.
        </p>
      ) : (
        <ul className="space-y-2">
          {topics.map((topic) => {
            const isOpen = !!openTopics[topic.source_filename]
            const isEditing = editingSource === topic.source_filename
            const baseId = toHtmlId(topic.source_filename)
            const headerId = `${baseId}-header`
            const contentId = `${baseId}-content`

            return (
              <li
                key={topic.source_filename}
                className="rounded-[8px] border border-[var(--color-border)]"
              >
                {isEditing ? (
                  /* ── Modo edición ──────────────────────────────────────── */
                  <div className="p-3 space-y-3">
                    <h3 className={sectionTitleClass}>
                      {prettyTopicName(topic.source_filename)}
                    </h3>
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
                        disabled={
                          reindexMutation.isPending || editContent.trim().length === 0
                        }
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
                  <>
                    {/* ── Header del acordeón ──────────────────────────────── */}
                    <div className="flex items-start gap-1 pr-3">
                      {/* Botón de toggle — cubre el área de nombre + resumen */}
                      <button
                        type="button"
                        id={headerId}
                        aria-expanded={isOpen}
                        aria-controls={contentId}
                        onClick={() => toggleTopic(topic.source_filename)}
                        className="flex flex-1 min-w-0 items-start gap-2 px-3 py-3 text-left hover:bg-[var(--color-surface)] rounded-l-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-interactive)]"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 shrink-0 text-[var(--color-text-secondary)] text-xs transition-transform duration-200 inline-block ${isOpen ? 'rotate-90' : ''}`}
                        >
                          ▸
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {prettyTopicName(topic.source_filename)}
                          </span>
                          {!isOpen && (
                            <span className="block mt-0.5 text-xs text-[var(--color-text-secondary)] truncate">
                              {summaryLine(topic.content)}
                            </span>
                          )}
                          <span className="block mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
                            {formatDate(topic.updated_at)}
                          </span>
                        </div>
                      </button>

                      {/* Acciones: editar / borrar (solo si canEdit) */}
                      {canEdit && (
                        <div className="flex gap-2 py-3 shrink-0 items-start">
                          <button
                            type="button"
                            onClick={() => startEdit(topic)}
                            className="text-sm font-medium text-[var(--color-interactive)] hover:underline focus-visible:outline-none focus-visible:underline"
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

                    {/* ── Contenido expandido (markdown formateado) ───────── */}
                    {isOpen && (
                      <div
                        id={contentId}
                        role="region"
                        aria-labelledby={headerId}
                        className="px-4 pb-4 border-t border-[var(--color-border)]"
                      >
                        <div className="pt-3">{renderMarkdown(topic.content)}</div>
                      </div>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
