'use client'

import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useBlockedTimes } from '@/hooks/use-blocked-times'
import { useCreateBlockedTime } from '@/hooks/use-create-blocked-time'
import { useDeleteBlockedTime } from '@/hooks/use-delete-blocked-time'
import {
  CreateBlockedTimeSchema,
  type CreateBlockedTimeFormValues,
} from '@/lib/schemas/profesionales-horarios.schema'

// ── Skeleton ──────────────────────────────────────────────────────────────────

function BlockedTimesSkeleton() {
  return (
    <div role="status" aria-label="Cargando bloqueos del profesional" className="animate-pulse space-y-2">
      {[1, 2].map((i) => (
        <div key={i} className="h-10 bg-[var(--color-surface)] rounded-[8px]" />
      ))}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface BlockedTimesViewProps {
  professionalId: string
  professionalName: string
}

// ── Formulario de bloqueo ─────────────────────────────────────────────────────

function AddBlockedTimeForm({ professionalId }: { professionalId: string }) {
  const createBlocked = useCreateBlockedTime(professionalId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateBlockedTimeFormValues>({
    resolver: standardSchemaResolver(CreateBlockedTimeSchema),
    defaultValues: { date_from: '', date_to: '', reason: '' },
  })

  const onSubmit = (data: CreateBlockedTimeFormValues) => {
    createBlocked.mutate(data, { onSuccess: () => reset() })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3 pt-4 border-t border-[var(--color-border)]">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">Agregar período bloqueado</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Fecha desde */}
        <div>
          <label htmlFor="block-date_from" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Fecha desde
          </label>
          <input
            id="block-date_from"
            type="date"
            {...register('date_from')}
            className={[
              'w-full px-2 py-1.5 rounded-[8px] border text-sm',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
              errors.date_from ? 'border-red-400' : 'border-[var(--color-border)]',
            ].join(' ')}
          />
          {errors.date_from && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.date_from.message}</p>
          )}
        </div>

        {/* Fecha hasta */}
        <div>
          <label htmlFor="block-date_to" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Fecha hasta
          </label>
          <input
            id="block-date_to"
            type="date"
            {...register('date_to')}
            className={[
              'w-full px-2 py-1.5 rounded-[8px] border text-sm',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
              errors.date_to ? 'border-red-400' : 'border-[var(--color-border)]',
            ].join(' ')}
          />
          {errors.date_to && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.date_to.message}</p>
          )}
        </div>

        {/* Motivo */}
        <div>
          <label htmlFor="block-reason" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Motivo (opcional)
          </label>
          <input
            id="block-reason"
            type="text"
            {...register('reason')}
            placeholder="Ej: Vacaciones"
            className={[
              'w-full px-2 py-1.5 rounded-[8px] border text-sm',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
              errors.reason ? 'border-red-400' : 'border-[var(--color-border)]',
            ].join(' ')}
          />
          {errors.reason && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.reason.message}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={createBlocked.isPending}
        className={[
          'px-4 py-2 rounded-[8px] text-sm font-medium',
          'bg-[var(--color-interactive)] text-white',
          'hover:opacity-90 transition-opacity min-h-[36px]',
          createBlocked.isPending ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {createBlocked.isPending ? 'Registrando...' : 'Registrar bloqueo'}
      </button>
    </form>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function BlockedTimesView({ professionalId, professionalName }: BlockedTimesViewProps) {
  const { blockedTimes, isPending, isError, refetch } = useBlockedTimes(professionalId)
  const deleteBlocked = useDeleteBlockedTime()

  return (
    <section data-tour="disponibilidad-bloqueos" aria-label={`Bloqueos de ${professionalName}`} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[8px] p-5 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Períodos bloqueados</h3>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
          Vacaciones, licencias y otros períodos sin disponibilidad
        </p>
      </div>

      {isPending && <BlockedTimesSkeleton />}

      {isError && !isPending && (
        <div
          role="alert"
          className="flex items-center gap-3 p-4 bg-[var(--color-surface)] rounded-[8px] border border-[var(--color-border)]"
        >
          <span className="text-[var(--color-text-secondary)] text-sm">
            No se pudieron cargar los bloqueos.
          </span>
          <button
            onClick={() => refetch()}
            className="text-[var(--color-interactive)] text-sm font-medium hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isPending && !isError && (
        <>
          {blockedTimes.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              No hay períodos bloqueados
            </p>
          ) : (
            <ul role="list" className="divide-y divide-[var(--color-border)]">
              {blockedTimes.map((block) => (
                <li
                  key={block.block_id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {block.date_from} – {block.date_to}
                    </span>
                    {block.reason && (
                      <span className="text-[var(--color-text-secondary)]">{block.reason}</span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteBlocked.mutate({ professionalId, blockId: block.block_id })}
                    disabled={deleteBlocked.isPending}
                    className="text-[var(--color-status-alert)] text-sm font-medium hover:underline disabled:opacity-50"
                    aria-label={`Eliminar bloqueo ${block.date_from}`}
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <AddBlockedTimeForm professionalId={professionalId} />
        </>
      )}
    </section>
  )
}
