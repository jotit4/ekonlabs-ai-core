'use client'

import { useState, useEffect, useMemo } from 'react'
import { useList } from '@refinedev/core'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { PatientRowItem } from '@/components/pacientes/PatientRowItem'
import { PatientForm } from '@/components/pacientes/PatientForm'
import type { Patient } from '@/types/patients'
import type { ConversationSummary } from '@/types/conversations'

// ─── Skeleton de carga ───────────────────────────────────────────────────────

function PatientTableSkeleton() {
  return (
    <div className="space-y-2" aria-label="Cargando pacientes" role="status">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded bg-[#f5f5f7]" />
      ))}
    </div>
  )
}

// ─── Buscador simple ─────────────────────────────────────────────────────────

interface SearchInputProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
}

function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <input
      type="search"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      aria-label={placeholder ?? 'Buscar'}
      style={{
        width: '100%',
        maxWidth: 420,
        padding: '10px 14px',
        fontSize: 15,
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: 'var(--radius-sm, 8px)',
        outline: 'none',
        color: 'var(--color-text-primary)',
        background: 'var(--color-surface, #fff)',
      }}
    />
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function PacientesPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const { query: listQuery, result } = useList<Patient>({
    resource: 'patients',
    meta: {
      select: `
        patient_id,
        full_name,
        phone_number,
        dni,
        obra_social,
        deletion_requested_at,
        appointments(appointment_id, start_at, end_at, status)
      `,
    },
    filters:
      debouncedQuery.length >= 2
        ? [
            {
              operator: 'or',
              value: [
                { field: 'full_name', operator: 'contains', value: debouncedQuery },
                { field: 'phone_number', operator: 'contains', value: debouncedQuery },
                { field: 'dni', operator: 'contains', value: debouncedQuery },
              ],
            },
          ]
        : [],
    sorters: [{ field: 'full_name', order: 'asc' }],
    pagination: { mode: 'off' },
    queryOptions: {
      queryKey: ['patients', 'list'],
      staleTime: 5 * 60 * 1000,
    },
  })

  const isPending = listQuery.isPending
  const isError = listQuery.isError
  const patients: Patient[] = (result?.data ?? []) as Patient[]

  const { data: conversations = [] } = useQuery<ConversationSummary[]>({
    queryKey: ['conversations', 'list', { status: 'all' }],
    queryFn: async () => {
      const res = await fetch('/api/conversations')
      const json = await res.json() as { conversations: ConversationSummary[] }
      return json.conversations
    },
    staleTime: 0,
  })

  const threadStateByPhone = useMemo(() => {
    const map = new Map<string, { status: 'active' | 'paused'; paused_reason: string | null }>()
    for (const conv of conversations) {
      if (conv.status === 'resolved') continue
      const status = conv.status === 'ai_active' ? 'active' : 'paused'
      const paused_reason =
        conv.status === 'human_takeover' ? 'human_takeover'
        : conv.status === 'needs_intervention' ? 'low_confidence'
        : null
      map.set(conv.phone_number, { status, paused_reason })
    }
    return map
  }, [conversations])

  const handlePatientCreated = (patientId: string) => {
    setDialogOpen(false)
    router.push(`/pacientes/${patientId}`)
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-8">
      {/* Header */}
      <header className="mb-6">
        <p className="text-sm text-[var(--color-text-secondary)]">Módulo</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Pacientes</h1>
      </header>

      {/* Buscador + Botón Nuevo paciente */}
      <div className="mb-6 flex items-center gap-4">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por DNI, nombre o teléfono..."
        />

        {/* Dialog de creación de paciente */}
        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Trigger
            className={[
              'shrink-0 px-4 py-2 rounded-[8px] text-sm font-medium',
              'bg-[var(--color-interactive)] text-white',
              'hover:opacity-90 transition-opacity min-h-[44px]',
            ].join(' ')}
          >
            Nuevo paciente
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Backdrop
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                zIndex: 40,
              }}
            />
            <Dialog.Popup
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 50,
                width: '90vw',
                maxWidth: 560,
                maxHeight: '90vh',
                overflowY: 'auto',
                backgroundColor: 'var(--color-surface, #fff)',
                borderRadius: 12,
                padding: '24px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
              }}
            >
              <Dialog.Title
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  marginBottom: 16,
                }}
              >
                Nuevo paciente
              </Dialog.Title>

              <PatientForm
                mode="create"
                onSuccess={handlePatientCreated}
              />
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      {/* Estados: cargando */}
      {isPending && <PatientTableSkeleton />}

      {/* Estado: error */}
      {isError && !isPending && (
        <div role="alert" className="text-center py-8 text-[var(--color-text-secondary)]">
          Error al cargar pacientes. Recargá la página.
        </div>
      )}

      {/* Lista de pacientes */}
      {!isPending && !isError && (
        <>
          {patients.length === 0 ? (
            <p className="text-center text-[15px] text-[var(--color-text-secondary)] py-8">
              {debouncedQuery.length >= 2
                ? `Sin resultados para "${debouncedQuery}"`
                : 'No hay pacientes registrados aún.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                role="table"
                aria-label="Lista de pacientes"
                style={{ width: '100%', borderCollapse: 'collapse' }}
              >
                <thead>
                  <tr role="row">
                    <th
                      scope="col"
                      style={{
                        textAlign: 'left',
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text-secondary)',
                        borderBottom: '1px solid rgba(0,0,0,0.08)',
                      }}
                    >
                      Paciente
                    </th>
                    <th
                      scope="col"
                      style={{
                        textAlign: 'left',
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text-secondary)',
                        borderBottom: '1px solid rgba(0,0,0,0.08)',
                      }}
                    >
                      Obra social
                    </th>
                    <th
                      scope="col"
                      style={{
                        textAlign: 'left',
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text-secondary)',
                        borderBottom: '1px solid rgba(0,0,0,0.08)',
                      }}
                    >
                      Último turno
                    </th>
                    <th
                      scope="col"
                      style={{
                        textAlign: 'left',
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text-secondary)',
                        borderBottom: '1px solid rgba(0,0,0,0.08)',
                      }}
                    >
                      Próximo turno
                    </th>
                    <th
                      scope="col"
                      style={{
                        textAlign: 'left',
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text-secondary)',
                        borderBottom: '1px solid rgba(0,0,0,0.08)',
                      }}
                    >
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => (
                    <PatientRowItem
                      key={p.patient_id}
                      patient={p}
                      onClick={() => router.push(`/pacientes/${p.patient_id}`)}
                      threadState={threadStateByPhone.get(p.phone_number) ?? null}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
