'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useProposeCorrection } from '@/hooks/use-knowledge-propose'
import { useReindexTopic } from '@/hooks/use-knowledge-topics'
import {
  KBProposeSchema,
  type KBProposeFormValues,
} from '@/lib/schemas/agente.schema'
import type { KBProposalResponse } from '@/types/agente'

const inputClass =
  'w-full px-3 py-2 rounded-[8px] border border-[var(--color-border)] text-sm bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]'

const labelClass = 'block text-sm font-medium text-[var(--color-text-primary)] mb-1'

const readonlyBlockClass =
  'px-3 py-2 rounded-[8px] border border-[var(--color-border)] text-sm bg-[var(--color-surface)] text-[var(--color-text-secondary)] whitespace-pre-wrap'

const secondaryButtonClass = [
  'px-4 py-2 rounded-[8px] text-sm border min-h-[44px]',
  'border-[var(--color-border)] text-[var(--color-text-secondary)]',
  'hover:bg-[var(--color-surface)] transition-colors',
  'disabled:opacity-50',
].join(' ')

const primaryButtonClass = [
  'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
  'bg-[var(--color-interactive)] text-white',
  'hover:opacity-90 transition-opacity',
  'disabled:opacity-50',
].join(' ')

const MAX_CONTENT_CHARS = 10000

const AUDIO_PREFIX = '[audio_transcription]:'

/** Limpia el prefijo de audio para mostrar el texto de referencia en el modal. */
function cleanForDisplay(raw: string): string {
  return raw.startsWith(AUDIO_PREFIX) ? raw.slice(AUDIO_PREFIX.length).trim() : raw
}

interface CorreccionAgenteModalProps {
  /** `content` del mensaje del agente que se está corrigiendo (read-only). */
  agentMessageContent: string
  /** `content` del mensaje del paciente anterior, o `null` si no hay. */
  patientQuestion: string | null
  onClose: () => void
}

export function CorreccionAgenteModal({
  agentMessageContent,
  patientQuestion,
  onClose,
}: CorreccionAgenteModalProps) {
  const [step, setStep] = useState<'capturar' | 'confirmar'>('capturar')
  const [proposal, setProposal] = useState<KBProposalResponse | null>(null)

  // Estado editable del paso "confirmar".
  const [topic, setTopic] = useState('')
  const [proposedText, setProposedText] = useState('')

  const proposeMutation = useProposeCorrection()
  const reindexMutation = useReindexTopic()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<KBProposeFormValues>({
    resolver: standardSchemaResolver(KBProposeSchema),
    defaultValues: {
      correction_note: '',
      patient_question: patientQuestion ?? undefined,
      wrong_answer: agentMessageContent,
    },
  })

  const onReview = (data: KBProposeFormValues) => {
    proposeMutation.mutate(
      {
        patient_question: patientQuestion ?? undefined,
        wrong_answer: agentMessageContent,
        correction_note: data.correction_note,
      },
      {
        onSuccess: (result) => {
          setProposal(result)
          setTopic(result.suggested_topic)
          setProposedText(result.proposed_text)
          setStep('confirmar')
        },
      },
    )
  }

  const [confirmError, setConfirmError] = useState<string | null>(null)

  const onConfirm = () => {
    setConfirmError(null)
    const source = topic.trim()
    const content = proposedText.trim()
    if (source.length === 0) {
      setConfirmError('El tema es obligatorio.')
      return
    }
    if (content.length === 0) {
      setConfirmError('El texto del tema es obligatorio.')
      return
    }
    if (content.length > MAX_CONTENT_CHARS) {
      setConfirmError(`El texto no puede superar ${MAX_CONTENT_CHARS} caracteres.`)
      return
    }
    reindexMutation.mutate(
      { source, content },
      { onSuccess: () => onClose() },
    )
  }

  const goBack = () => {
    // Conservamos el correction_note (el form no se desmonta, mantiene su valor).
    setConfirmError(null)
    setStep('capturar')
  }

  const reviewPending = proposeMutation.isPending
  const confirmPending = reindexMutation.isPending

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="correccion-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="correccion-agente-modal"
    >
      <div className="w-full max-w-lg bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[12px] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2
          id="correccion-modal-title"
          className="text-base font-semibold text-[var(--color-text-primary)] mb-1"
        >
          Corregir al agente
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          {step === 'capturar'
            ? 'Contanos el dato correcto y armamos una propuesta de conocimiento para que el agente la revise.'
            : 'Revisá la propuesta del asistente, ajustá el texto si hace falta y guardalo como conocimiento del agente.'}
        </p>

        {/* Contexto read-only (visible en ambos pasos). */}
        <div className="mb-3">
          <span className={labelClass}>Mensaje del paciente</span>
          <p className={readonlyBlockClass} data-testid="correccion-patient-question">
            {patientQuestion
              ? cleanForDisplay(patientQuestion)
              : 'Sin mensaje previo del paciente'}
          </p>
        </div>

        <div className="mb-4">
          <span className={labelClass}>Respuesta del agente (a corregir)</span>
          <p className={readonlyBlockClass} data-testid="correccion-agent-answer">
            {cleanForDisplay(agentMessageContent)}
          </p>
        </div>

        {/* ── Paso 1: capturar ──────────────────────────────────────────── */}
        {step === 'capturar' && (
          <form
            onSubmit={handleSubmit(onReview)}
            noValidate
            aria-label="Formulario de corrección del agente"
          >
            <div className="mb-4">
              <label htmlFor="correccion-note" className={labelClass}>
                ¿Qué corregimos? Contanos el dato correcto{' '}
                <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="correccion-note"
                rows={5}
                autoFocus
                {...register('correction_note')}
                className={`${inputClass} resize-vertical`}
                aria-invalid={!!errors.correction_note}
                aria-describedby={
                  errors.correction_note ? 'correccion-note-error' : undefined
                }
                disabled={reviewPending}
              />
              {errors.correction_note && (
                <p
                  id="correccion-note-error"
                  role="alert"
                  className="mt-1 text-xs text-red-600"
                >
                  {errors.correction_note.message}
                </p>
              )}
            </div>

            {proposeMutation.isError && (
              <p role="alert" className="mb-3 text-xs text-red-600">
                No pudimos generar la propuesta. Probá de nuevo.
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={reviewPending}
                className={secondaryButtonClass}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={reviewPending}
                className={primaryButtonClass}
              >
                {reviewPending ? 'Analizando...' : 'Revisar'}
              </button>
            </div>
          </form>
        )}

        {/* ── Paso 2: confirmar ─────────────────────────────────────────── */}
        {step === 'confirmar' && proposal && (
          <div aria-label="Revisión de la propuesta de corrección">
            <div className="mb-4">
              <label htmlFor="correccion-topic" className={labelClass}>
                Tema
                {proposal.is_new_topic && (
                  <span
                    data-testid="correccion-new-topic-badge"
                    className="ml-2 inline-block rounded-full bg-[var(--color-interactive)] px-2 py-0.5 text-[11px] font-medium text-white align-middle"
                  >
                    tema nuevo
                  </span>
                )}
              </label>
              <input
                id="correccion-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className={inputClass}
                disabled={confirmPending}
                maxLength={120}
              />
            </div>

            <div className="mb-4">
              <span className={labelClass}>Texto actual</span>
              <p className={readonlyBlockClass} data-testid="correccion-current-text">
                {proposal.current_text
                  ? proposal.current_text
                  : '(tema nuevo, sin texto previo)'}
              </p>
            </div>

            <div className="mb-4">
              <label htmlFor="correccion-proposed" className={labelClass}>
                Texto propuesto (editable)
              </label>
              <textarea
                id="correccion-proposed"
                rows={6}
                value={proposedText}
                onChange={(e) => setProposedText(e.target.value)}
                className={`${inputClass} resize-vertical`}
                disabled={confirmPending}
                maxLength={MAX_CONTENT_CHARS}
              />
              <p className="text-xs text-[var(--color-text-secondary)] text-right">
                {proposedText.length}/{MAX_CONTENT_CHARS}
              </p>
            </div>

            {proposal.gap_questions.length > 0 && (
              <div
                data-testid="correccion-gap-questions"
                className="mb-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  Para que quede más completo, te falta aclarar:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {proposal.gap_questions.map((q, i) => (
                    <li key={i} className="text-sm text-[var(--color-text-secondary)]">
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {proposal.contradiction_warning && (
              <div
                role="status"
                data-testid="correccion-contradiction-warning"
                className="mb-4 rounded-[8px] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                {proposal.contradiction_warning}
              </div>
            )}

            {(reindexMutation.isError || confirmError) && (
              <p role="alert" className="mb-3 text-xs text-red-600">
                {confirmError ?? 'No pudimos guardar el tema. Probá de nuevo.'}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={goBack}
                disabled={confirmPending}
                className={secondaryButtonClass}
              >
                Volver
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirmPending}
                className={primaryButtonClass}
              >
                {confirmPending ? 'Guardando...' : 'Confirmar y guardar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
