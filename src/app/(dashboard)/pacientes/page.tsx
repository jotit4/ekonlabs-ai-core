'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useList } from '@refinedev/core'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { PatientRowItem } from '@/components/pacientes/PatientRowItem'
import type { Patient } from '@/types/patients'
import { EmptyState } from '@/components/ui/empty-state'
import { Users, SearchX } from 'lucide-react'

const PatientForm = dynamic(() =>
  import('@/components/pacientes/PatientForm').then((mod) => mod.PatientForm),
)

const PAGE_SIZE = 50

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
      data-tour="pacientes-search"
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
  const [currentPage, setCurrentPage] = useState(1)

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
      setCurrentPage(1)
    }, 300)
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
        appointments(appointment_id, start_at, status),
        thread_states(status, paused_reason)
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
    // Antes se pedían hasta 500 pacientes, con TODO su historial de turnos, y
    // además otra consulta que reconstruía la bandeja completa de WhatsApp.
    // Una página acotada mantiene estable el payload aun cuando crezca ISADI.
    pagination: { mode: 'server', pageSize: PAGE_SIZE, currentPage },
    queryOptions: {
      queryKey: ['patients', 'list', debouncedQuery],
      staleTime: 5 * 60 * 1000,
    },
  })

  const isPending = listQuery.isPending
  const isError = listQuery.isError
  const patients: Patient[] = (result?.data ?? []) as Patient[]
  const totalPatients = result?.total ?? patients.length
  const totalPages = Math.max(1, Math.ceil(totalPatients / PAGE_SIZE))

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
            data-tour="pacientes-nuevo-btn"
            className={[
              'shrink-0 px-4 py-2 rounded-[8px] text-sm font-medium',
              'bg-[var(--color-interactive)] text-white',
              'hover:opacity-90 transition-opacity min-h-[44px]',
            ].join(' ')}
          >
            Nuevo paciente
          </Dialog.Trigger>

          {dialogOpen && <Dialog.Portal>
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
          </Dialog.Portal>}
        </Dialog.Root>
      </div>

      {/* Estados: cargando */}
      {isPending && <PatientTableSkeleton />}

      {/* Estado: error */}
      {isError && !isPending && (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No se pudo cargar la lista de pacientes"
          description="Puede ser un problema temporal. Intentá recargar la página."
          action={{ label: 'Recargar', onClick: () => window.location.reload() }}
        />
      )}

      {/* Lista de pacientes */}
      {!isPending && !isError && (
        <>
          {patients.length === 0 ? (
            debouncedQuery.length >= 2 ? (
              <EmptyState
                icon={<SearchX className="h-6 w-6" />}
                title={`Sin resultados para "${debouncedQuery}"`}
                description="Probá con el DNI completo, el nombre exacto o el número de teléfono."
              />
            ) : (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Todavía no hay pacientes registrados"
                description="Usá el botón 'Nuevo paciente' para agregar el primero."
              />
            )
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
                      threadState={p.thread_states?.[0] ?? null}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <nav
              aria-label="Paginación de pacientes"
              className="mt-6 flex items-center justify-between gap-4"
            >
              <p className="text-sm text-[var(--color-text-secondary)]">
                Página {currentPage} de {totalPages} · {totalPatients} pacientes
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1 || listQuery.isFetching}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className="min-h-[44px] rounded-[8px] border border-[var(--color-border)] px-4 text-sm disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={currentPage === totalPages || listQuery.isFetching}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  className="min-h-[44px] rounded-[8px] border border-[var(--color-border)] px-4 text-sm disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </section>
  )
}
