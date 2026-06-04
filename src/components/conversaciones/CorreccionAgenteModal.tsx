'use client'

import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useCreateKnowledge } from '@/hooks/use-knowledge-mutations'
import {
  CorreccionAgenteSchema,
  type CorreccionAgenteFormValues,
} from '@/lib/schemas/agente.schema'
import { buildCorreccionContent } from '@/lib/conversaciones/correccion'

const inputClass =
  'w-full px-3 py-2 rounded-[8px] border border-[var(--color-border)] text-sm bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]'

const labelClass = 'block text-sm font-medium text-[var(--color-text-primary)] mb-1'

const readonlyBlockClass =
  'px-3 py-2 rounded-[8px] border border-[var(--color-border)] text-sm bg-[var(--color-surface)] text-[var(--color-text-secondary)] whitespace-pre-wrap'

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
  const createMutation = useCreateKnowledge()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CorreccionAgenteFormValues>({
    resolver: standardSchemaResolver(CorreccionAgenteSchema),
    defaultValues: { correct_answer: '', source_filename: 'correcciones' },
  })

  const onSubmit = (data: CorreccionAgenteFormValues) => {
    const content = buildCorreccionContent({
      patientQuestion,
      correctAnswer: data.correct_answer,
    })
    if (content.length > 5000) {
      setError('correct_answer', {
        message: 'La corrección es demasiado larga (máx. 5.000 caracteres).',
      })
      return
    }
    createMutation.mutate(
      { content, source_filename: data.source_filename?.trim() || 'correcciones' },
      { onSuccess: onClose },
    )
  }

  const isPending = createMutation.isPending || isSubmitting

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
          ¿Qué debería haber respondido?
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          La corrección se guarda como conocimiento del agente para consultas similares
          futuras.
        </p>

        {/* Contexto read-only */}
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

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          aria-label="Formulario de corrección del agente"
        >
          <div className="mb-4">
            <label htmlFor="correccion-correct-answer" className={labelClass}>
              ¿Qué debería haber respondido? <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="correccion-correct-answer"
              rows={5}
              autoFocus
              {...register('correct_answer')}
              className={`${inputClass} resize-vertical`}
              aria-invalid={!!errors.correct_answer}
              aria-describedby={
                errors.correct_answer ? 'correccion-correct-answer-error' : undefined
              }
              disabled={isPending}
            />
            {errors.correct_answer && (
              <p
                id="correccion-correct-answer-error"
                role="alert"
                className="mt-1 text-xs text-red-600"
              >
                {errors.correct_answer.message}
              </p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="correccion-source" className={labelClass}>
              Tema (opcional)
            </label>
            <input
              id="correccion-source"
              type="text"
              {...register('source_filename')}
              className={inputClass}
              aria-invalid={!!errors.source_filename}
              aria-describedby={
                errors.source_filename ? 'correccion-source-error' : undefined
              }
              disabled={isPending}
            />
            {errors.source_filename && (
              <p
                id="correccion-source-error"
                role="alert"
                className="mt-1 text-xs text-red-600"
              >
                {errors.source_filename.message}
              </p>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className={[
                'px-4 py-2 rounded-[8px] text-sm border min-h-[44px]',
                'border-[var(--color-border)] text-[var(--color-text-secondary)]',
                'hover:bg-[var(--color-surface)] transition-colors',
                'disabled:opacity-50',
              ].join(' ')}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={[
                'px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px]',
                'bg-[var(--color-interactive)] text-white',
                'hover:opacity-90 transition-opacity',
                'disabled:opacity-50',
              ].join(' ')}
            >
              {isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
