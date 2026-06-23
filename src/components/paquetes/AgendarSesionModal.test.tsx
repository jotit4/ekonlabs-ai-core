import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AgendarSesionModal } from './AgendarSesionModal'

const mockFetch = vi.fn()
global.fetch = mockFetch

// Dialog mock (igual que los otros modales del módulo).
vi.mock('@base-ui/react/dialog', () => ({
  Dialog: {
    Root: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="dialog-root">{children}</div> : null,
    Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Backdrop: () => <div data-testid="dialog-backdrop" />,
    Popup: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <div role="dialog" {...props}>{children}</div>
    ),
    Title: ({ children, id }: { children: React.ReactNode; id?: string }) => <h2 id={id}>{children}</h2>,
    Close: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>{children}</button>
    ),
  },
}))

const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

// El picker se mockea: expone botones que, al clickear, emiten onToggle con un slot
// determinístico. Así el test del modal verifica la acumulación + confirmación sin
// depender de la disponibilidad real.
vi.mock('@/components/agenda/AvailabilitySlotPicker', () => ({
  AvailabilitySlotPicker: ({
    onToggle,
  }: {
    onToggle: (s: { start_at: string; end_at: string; date: string; label: string }) => void
  }) => (
    <div data-testid="slot-picker">
      <button
        type="button"
        onClick={() =>
          onToggle({ start_at: '2026-06-15T13:00:00.000Z', end_at: '2026-06-15T14:00:00.000Z', date: '2026-06-15', label: '10:00' })
        }
      >
        slot-1000
      </button>
      <button
        type="button"
        onClick={() =>
          onToggle({ start_at: '2026-06-16T13:00:00.000Z', end_at: '2026-06-16T14:00:00.000Z', date: '2026-06-16', label: '10:00' })
        }
      >
        slot-1001
      </button>
    </div>
  ),
}))

const baseProps = {
  open: true,
  onClose: vi.fn(),
  treatmentId: 'trt-1',
  serviceId: 'svc-1',
  professionalId: 'prof-1',
  serviceName: 'Kinesiología',
  professionalName: 'Patricia Pérez',
  porAgendar: 8,
  patientId: 'pat-1',
}

describe('AgendarSesionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('el botón de confirmar arranca deshabilitado (sin slots elegidos)', () => {
    render(<AgendarSesionModal {...baseProps} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /agendar sesión/i })).toBeDisabled()
  })

  it('acumula varios horarios y los lista', async () => {
    const user = userEvent.setup()
    render(<AgendarSesionModal {...baseProps} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'slot-1000' }))
    await user.click(screen.getByRole('button', { name: 'slot-1001' }))

    expect(screen.getByText(/Seleccionados \(2\)/)).toBeInTheDocument()
    // El botón pasa a "Agendar 2 sesiones".
    expect(screen.getByRole('button', { name: /agendar 2 sesiones/i })).toBeEnabled()
  })

  it('confirma con POST a /sessions con la lista de { start_at, end_at } e invalida queries', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true, creadas: 2, skipped: [] }) })
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<AgendarSesionModal {...baseProps} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'slot-1000' }))
    await user.click(screen.getByRole('button', { name: 'slot-1001' }))
    await user.click(screen.getByRole('button', { name: /agendar 2 sesiones/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/treatments/trt-1/sessions',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.slots).toEqual([
      { start_at: '2026-06-15T13:00:00.000Z', end_at: '2026-06-15T14:00:00.000Z' },
      { start_at: '2026-06-16T13:00:00.000Z', end_at: '2026-06-16T14:00:00.000Z' },
    ])
    // Invalidó el tracking (treatments) → el contador se refresca.
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['treatments'], exact: false }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('en 409 avisa que el horario ya no está disponible y limpia la selección', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'Esos horarios ya no están disponibles' }) })
    const user = userEvent.setup()
    render(<AgendarSesionModal {...baseProps} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'slot-1000' }))
    await user.click(screen.getByRole('button', { name: /agendar sesión/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/ya no está disponible/i)
    })
    // La selección se limpió.
    expect(screen.queryByText(/Seleccionados/)).not.toBeInTheDocument()
  })

  it('no permite seleccionar más sesiones que el cupo (porAgendar)', async () => {
    const user = userEvent.setup()
    render(<AgendarSesionModal {...baseProps} onClose={vi.fn()} porAgendar={1} />)

    await user.click(screen.getByRole('button', { name: 'slot-1000' }))
    await user.click(screen.getByRole('button', { name: 'slot-1001' })) // se ignora (cupo=1)

    expect(screen.getByText(/Seleccionados \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/máximo de sesiones que faltan agendar \(1\)/i)).toBeInTheDocument()
  })
})
