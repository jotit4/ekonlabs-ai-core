'use client'

import { useRef, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@base-ui/react/dialog'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useSoftSync } from '@/hooks/use-soft-sync'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
import { PatientForm } from '@/components/pacientes/PatientForm'
import { AppointmentHistory, type AppointmentForHistory } from '@/components/pacientes/AppointmentHistory'
import { WhatsAppHistory } from '@/components/pacientes/WhatsAppHistory'
import { PatientStatusBadge } from '@/components/pacientes/PatientStatusBadge'
import { ClinicalNoteEditor } from '@/components/pacientes/ClinicalNoteEditor'
import { ClinicalNotesHistory } from '@/components/pacientes/ClinicalNotesHistory'
import { PatientDeletionRequest } from '@/components/pacientes/PatientDeletionRequest'
import type { Patient } from '@/types/patients'

// ─── Tipos locales ────────────────────────────────────────────────────────────

interface PatientWithHistory extends Patient {
  appointments?: AppointmentForHistory[]
}

// ─── Definición de tabs ───────────────────────────────────────────────────────

type TabId = 'datos' | 'turnos' | 'conversaciones' | 'notas'

interface TabDef {
  id: TabId
  label: string
  param: string | null
  roles?: Array<'doctor' | 'admin'>
}

const TABS: TabDef[] = [
  { id: 'datos', label: 'Datos personales', param: null },
  { id: 'turnos', label: 'Historial de turnos', param: 'turnos' },
  { id: 'conversaciones', label: 'Conversaciones', param: 'conversaciones' },
  { id: 'notas', label: 'Notas clínicas', param: 'notas', roles: ['doctor', 'admin'] },
]

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PatientFichaSkeleton() {
  return (
    <div className="space-y-4" aria-label="Cargando ficha del paciente" role="status">
      <div className="h-6 w-32 animate-pulse rounded bg-[#f5f5f7]" />
      <div className="h-8 w-64 animate-pulse rounded bg-[#f5f5f7]" />
      {/* Skeleton para tabs */}
      <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid rgba(0,0,0,0.1)', paddingBottom: 8 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-32 animate-pulse rounded bg-[#f5f5f7]" />
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-[#f5f5f7]" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded bg-[#f5f5f7]" />
    </div>
  )
}

// ─── Campo de dato personal ───────────────────────────────────────────────────

function DataField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
        {label}
      </p>
      <p style={{ fontSize: 15 }}>{value || '—'}</p>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PacienteFichaPage() {
  const params = useParams<{ id: string }>()
  const patientId = params.id
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const [editOpen, setEditOpen] = useState(false)

  const { role } = useCurrentTenant()
  const supabase = createSupabaseBrowserClient()

  // Tab activo — default "datos" (sin param)
  const tabParam = searchParams.get('tab') as TabId | null
  const activeTab: TabId = tabParam ?? 'datos'

  function changeTab(param: string | null) {
    const url = param ? `/pacientes/${patientId}?tab=${param}` : `/pacientes/${patientId}`
    router.push(url)
  }

  // Filtrar tabs según rol
  const visibleTabs = TABS.filter(
    (tab) => !tab.roles || (role && (tab.roles as string[]).includes(role))
  )

  // Obtener datos del paciente con join de appointments
  const {
    data: patient,
    isPending,
    isError,
  } = useQuery<PatientWithHistory | null>({
    queryKey: ['patients', 'one', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select(
          '*, appointments(appointment_id, start_at, end_at, status, services(name, professional_name))'
        )
        .eq('patient_id', patientId)
        .maybeSingle()
      if (error) throw error
      return data as PatientWithHistory | null
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!patientId,
  })

  // thread_states se fetcha por separado usando phone_number — evita depender de la FK
  // thread_states_patient_fkey que aún no está aplicada en producción
  const { data: threadStateData } = useQuery({
    queryKey: ['thread_states', patient?.phone_number],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('thread_states')
        .select('status, paused_reason')
        .eq('phone_number', patient!.phone_number)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!patient?.phone_number,
    staleTime: 5 * 60 * 1000,
  })

  // Soft-sync pasivo — fire-and-forget (Story 2.7)
  const { trigger, status: syncStatus } = useSoftSync()

  useEffect(() => {
    if (patientId) {
      void trigger(patientId)
    }
  }, [patientId, trigger])

  // Audit trail patient_accessed — no bloqueante
  useEffect(() => {
    if (patientId) {
      fetch(`/api/patients/${patientId}/access-log`, { method: 'POST' }).catch(() => {})
    }
  }, [patientId])

  // UX-DR22: foco inicial al botón de retorno
  useEffect(() => {
    backButtonRef.current?.focus()
  }, [])

  // ── Estado: loading ─────────────────────────────────────────────────────────
  if (isPending) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <PatientFichaSkeleton />
      </main>
    )
  }

  // ── Estado: error ───────────────────────────────────────────────────────────
  if (isError) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <div role="alert" className="text-center py-8 text-[var(--color-text-secondary)]">
          Error al cargar la ficha del paciente. Recargá la página.
        </div>
      </main>
    )
  }

  // ── Estado: 404 ─────────────────────────────────────────────────────────────
  if (!patient) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="text-center py-8">
          <p className="text-[var(--color-text-secondary)] mb-4">Paciente no encontrado</p>
          <button
            onClick={() => router.push('/pacientes')}
            style={{
              color: '#0071e3',
              fontSize: 15,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            ← Volver a pacientes
          </button>
        </div>
      </main>
    )
  }

  // ── Render principal ────────────────────────────────────────────────────────

  const handleEditSuccess = () => {
    setEditOpen(false)
    void queryClient.invalidateQueries({ queryKey: ['patients', 'one', patientId] })
    void queryClient.invalidateQueries({ queryKey: ['patients', 'list'] })
  }

  const handleDeletionSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ['patients', 'one', patientId] })
    void queryClient.invalidateQueries({ queryKey: ['patients', 'list'] })
  }

  // Detectar si el paciente tiene eliminación pendiente
  const hasDeletionPending = !!patient.deletion_requested_at

  const threadState = threadStateData ?? null

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      {/* Botón de retorno — UX-DR16, UX-DR22 */}
      <button
        ref={backButtonRef}
        onClick={() => router.push('/pacientes')}
        style={{
          color: '#0071e3',
          fontSize: 15,
          fontWeight: 400,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        ‹ Pacientes
      </button>

      {/* Header: Nombre + PatientStatusBadge */}
      <header
        className="mb-4"
        style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 600 }}>{patient.full_name}</h1>
        <PatientStatusBadge threadState={threadState} />
      </header>

      {/* Banner de eliminación programada */}
      {hasDeletionPending && patient.deletion_effective_at && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            border: '1px solid rgba(0,0,0,0.1)',
            backgroundColor: '#fafafa',
            marginBottom: 16,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}
        >
          Eliminación programada para{' '}
          <strong style={{ color: 'var(--color-text-primary)' }}>
            {format(new Date(patient.deletion_effective_at), "d 'de' MMMM 'de' yyyy", { locale: es })}
          </strong>
          . La ficha es de solo lectura.
        </div>
      )}

      {/* Sistema de tabs */}
      <nav aria-label="Secciones de la ficha" role="tablist" style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            gap: 0,
            borderBottom: '1px solid rgba(0,0,0,0.1)',
          }}
        >
          {visibleTabs.map((tab) => {
            const isActive = activeTab === (tab.param ?? 'datos')
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => changeTab(tab.param)}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #1d1d1f' : '2px solid transparent',
                  fontWeight: isActive ? 500 : 400,
                  fontSize: 15,
                  cursor: 'pointer',
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  transition: 'border-color 0.15s, font-weight 0.15s',
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Contenido de tabs */}

      {/* Tab: Datos personales */}
      {activeTab === 'datos' && (
        <section aria-label="Datos personales" role="tabpanel" style={{ marginBottom: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>Datos personales</h2>

            {/* Botones de acción — solo visibles si NO hay eliminación pendiente */}
            {!hasDeletionPending && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Dialog de edición — @base-ui/react/dialog (no shadcn) */}
                <Dialog.Root open={editOpen} onOpenChange={setEditOpen}>
                  <Dialog.Trigger
                    className={[
                      'px-4 py-2 rounded-[8px] text-sm font-medium',
                      'bg-[var(--color-interactive)] text-white',
                      'hover:opacity-90 transition-opacity min-h-[44px]',
                    ].join(' ')}
                  >
                    Editar datos
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
                        style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}
                      >
                        Editar datos del paciente
                      </Dialog.Title>
                      <PatientForm
                        mode="edit"
                        patient={patient}
                        onSuccess={handleEditSuccess}
                      />
                    </Dialog.Popup>
                  </Dialog.Portal>
                </Dialog.Root>

                {/* Solicitar eliminación — solo para admin */}
                {role === 'admin' && (
                  <PatientDeletionRequest
                    patientId={patientId}
                    patientName={patient.full_name}
                    patientDni={patient.dni}
                    onSuccess={handleDeletionSuccess}
                  />
                )}
              </div>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            <DataField label="Nombre completo" value={patient.full_name} />
            <DataField label="Teléfono" value={patient.phone_number} />
            <DataField label="DNI" value={patient.dni} />
            <DataField label="Email" value={patient.email} />
            <DataField label="Fecha de nacimiento" value={patient.date_of_birth} />
            <DataField label="Obra social" value={patient.obra_social} />
            <DataField label="Número de afiliado" value={patient.obra_social_number} />
            <DataField label="Domicilio" value={patient.address} />
            <DataField label="Motivo de consulta" value={patient.reason_for_visit} />
            <DataField label="Notas" value={patient.notes} />
          </div>
        </section>
      )}

      {/* Tab: Historial de turnos */}
      {activeTab === 'turnos' && (
        <section aria-label="Historial de turnos" role="tabpanel">
          <AppointmentHistory
            appointments={patient.appointments as AppointmentForHistory[] | undefined}
            syncStatus={syncStatus}
          />
        </section>
      )}

      {/* Tab: Conversaciones WhatsApp */}
      {activeTab === 'conversaciones' && (
        <section aria-label="Conversaciones WhatsApp" role="tabpanel">
          <WhatsAppHistory
            patientId={patientId}
            phoneNumber={patient.phone_number}
            threadState={threadState}
          />
        </section>
      )}

      {/* Tab: Notas clínicas — solo para doctor y admin */}
      {activeTab === 'notas' && (role === 'doctor' || role === 'admin') && (
        <section aria-label="Notas clínicas" role="tabpanel">
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Notas clínicas</h2>

          {/* Nueva nota — solo si no hay eliminación pendiente */}
          {!hasDeletionPending && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Nueva nota</h3>
              <ClinicalNoteEditor
                patientId={patientId}
                onSaved={() => {
                  void queryClient.invalidateQueries({
                    queryKey: ['patients', 'clinical-notes', patientId],
                  })
                }}
              />
            </div>
          )}

          {/* Historial de notas anteriores — siempre visible (solo lectura) */}
          <ClinicalNotesHistory patientId={patientId} />
        </section>
      )}
    </main>
  )
}
