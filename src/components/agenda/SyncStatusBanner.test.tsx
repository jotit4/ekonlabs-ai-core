import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock @tanstack/react-query
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

import { SyncStatusBanner } from './SyncStatusBanner'
import type { Appointment } from '@/types/appointments'

const BASE_APPOINTMENT: Appointment = {
  appointment_id: 'apt-1',
  tenant_id: 'tenant-1',
  phone_number: '+541100000000',
  patient_id: 'pat-1',
  service_id: 'svc-1',
  appointment_time: '2026-05-07T09:00:00',
  start_at: '2026-05-07T09:00:00',
  end_at: '2026-05-07T10:00:00',
  status: 'confirmed',
  calendar_event_id: null,
  reminder_sent_at: null,
  attendance_confirmed: null,
  created_at: '2026-05-01T00:00:00.000Z',
  patients: { full_name: 'Juan García' },
  services: { name: 'Kinesiología', professional: null },
}

const SYNCED_APPOINTMENT: Appointment = {
  ...BASE_APPOINTMENT,
  appointment_id: 'apt-2',
  calendar_event_id: 'gcal-event-xyz',
  reminder_sent_at: null,
  attendance_confirmed: null,
}

const DATE = '2026-05-07'

describe('SyncStatusBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
  })

  it('no renderiza cuando todos los turnos tienen calendar_event_id', () => {
    render(
      <SyncStatusBanner appointments={[SYNCED_APPOINTMENT]} date={DATE} />
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renderiza el banner cuando al menos un turno tiene calendar_event_id === null', () => {
    render(
      <SyncStatusBanner appointments={[BASE_APPOINTMENT]} date={DATE} />
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Sincronización con Google Calendar pendiente')).toBeInTheDocument()
  })

  it('el botón "Sincronizar ahora" llama a POST /api/appointments/sync', async () => {
    const user = userEvent.setup()
    render(
      <SyncStatusBanner appointments={[BASE_APPOINTMENT]} date={DATE} />
    )

    await user.click(screen.getByRole('button', { name: /sincronizar turnos pendientes/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/appointments/sync',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('muestra "Sincronizando..." y deshabilita el botón mientras fetch está pendiente', async () => {
    // fetch que nunca resuelve durante el test
    let resolvePromise!: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void
    mockFetch.mockReturnValue(
      new Promise(resolve => { resolvePromise = resolve })
    )

    const user = userEvent.setup()
    render(
      <SyncStatusBanner appointments={[BASE_APPOINTMENT]} date={DATE} />
    )

    await user.click(screen.getByRole('button', { name: /sincronizar turnos pendientes/i }))

    await waitFor(() => {
      // El botón debe estar deshabilitado mientras sincroniza
      expect(screen.getByRole('button', { name: /sincronizar turnos pendientes/i })).toBeDisabled()
      // El mensaje de estado aparece en el banner (span.flex-1)
      expect(screen.getAllByText('Sincronizando...').length).toBeGreaterThan(0)
    })

    // Resolver para no dejar promesas pendientes
    resolvePromise({ ok: true, status: 200, json: async () => ({ success: true }) })
  })

  it('muestra mensaje de error cuando la llamada falla', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'sync_unavailable' }) })

    const user = userEvent.setup()
    render(
      <SyncStatusBanner appointments={[BASE_APPOINTMENT]} date={DATE} />
    )

    await user.click(screen.getByRole('button', { name: /sincronizar turnos pendientes/i }))

    await waitFor(() => {
      expect(screen.getByText('No se pudo iniciar la sincronización. Intenta nuevamente.')).toBeInTheDocument()
    })

    // Botón debe volver a estar habilitado
    expect(screen.getByRole('button', { name: /sincronizar turnos pendientes/i })).not.toBeDisabled()
  })

  it('invalida la query ["agenda", "day", date] tras respuesta exitosa', async () => {
    const user = userEvent.setup()
    render(
      <SyncStatusBanner appointments={[BASE_APPOINTMENT]} date={DATE} />
    )

    await user.click(screen.getByRole('button', { name: /sincronizar turnos pendientes/i }))

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['agenda', 'day', DATE],
      })
    })
  })

  it('tiene aria-live="polite" en el contenedor del banner', () => {
    render(
      <SyncStatusBanner appointments={[BASE_APPOINTMENT]} date={DATE} />
    )
    const banner = screen.getByRole('status')
    expect(banner).toHaveAttribute('aria-live', 'polite')
  })
})
