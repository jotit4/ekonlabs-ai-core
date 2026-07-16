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
// determinístico (incluye professional_id, como haría el picker real en modo
// "cualquier profesional" — Pedido A #3). Así el test del modal verifica la
// acumulación + confirmación sin depender de la disponibilidad real.
vi.mock('@/components/agenda/AvailabilitySlotPicker', () => ({
  AvailabilitySlotPicker: ({
    onToggle,
  }: {
    onToggle: (s: { start_at: string; end_at: string; date: string; label: string; professional_id?: string }) => void
  }) => (
    <div data-testid="slot-picker">
      <button
        type="button"
        onClick={() =>
          onToggle({ start_at: '2026-06-15T13:00:00.000Z', end_at: '2026-06-15T14:00:00.000Z', date: '2026-06-15', label: '10:00', professional_id: 'prof-1' })
        }
      >
        slot-1000
      </button>
      <button
        type="button"
        onClick={() =>
          onToggle({ start_at: '2026-06-16T13:00:00.000Z', end_at: '2026-06-16T14:00:00.000Z', date: '2026-06-16', label: '10:00', professional_id: 'prof-2' })
        }
      >
        slot-1001
      </button>
    </div>
  ),
}))

// La auto-propuesta del scheduler se prueba en su archivo. Acá evitamos que la
// consulta de rango consuma el mock global de fetch reservado para el POST.
vi.mock('@/hooks/use-availability', () => ({
  fetchAvailabilityDays: vi.fn().mockResolvedValue({ days: {} }),
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

    expect(screen.getByText(/Sesiones elegidas \(2\/8\)/)).toBeInTheDocument()
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
    expect(screen.queryByText(/Sesiones elegidas/)).not.toBeInTheDocument()
  })

  it('no permite seleccionar más sesiones que el cupo (porAgendar)', async () => {
    const user = userEvent.setup()
    render(<AgendarSesionModal {...baseProps} onClose={vi.fn()} porAgendar={1} />)

    await user.click(screen.getByRole('button', { name: 'slot-1000' }))
    await user.click(screen.getByRole('button', { name: 'slot-1001' })) // se ignora (cupo=1)

    expect(screen.getByText(/Sesiones elegidas \(1\/1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Completaste las 1/i)).toBeInTheDocument()
  })

  describe('Pedido A #2/#3 (ISADI 2026-07-14) — paquete SIN profesional fijo ("cualquier profesional")', () => {
    it('con professionalId=null, cada sesión confirmada viaja con SU PROPIO professional_id', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true, creadas: 2, skipped: [] }) })
      const user = userEvent.setup()
      render(<AgendarSesionModal {...baseProps} onClose={vi.fn()} professionalId={null} professionalName={null} />)

      // El encabezado ya no expone ni pide profesional: sólo informa servicio y cupo.
      expect(screen.getByText(/Kinesiología.*faltan agendar 8/i)).toBeInTheDocument()
      expect(screen.queryByText(/Cualquier profesional|Patricia Pérez/i)).not.toBeInTheDocument()

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
        { start_at: '2026-06-15T13:00:00.000Z', end_at: '2026-06-15T14:00:00.000Z', professional_id: 'prof-1' },
        { start_at: '2026-06-16T13:00:00.000Z', end_at: '2026-06-16T14:00:00.000Z', professional_id: 'prof-2' },
      ])
    })

    it('con profesional FIJO (baseProps), NO manda professional_id por slot', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true, creadas: 1, skipped: [] }) })
      const user = userEvent.setup()
      render(<AgendarSesionModal {...baseProps} onClose={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'slot-1000' }))
      await user.click(screen.getByRole('button', { name: /agendar sesión/i }))

      await waitFor(() => expect(mockFetch).toHaveBeenCalled())
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.slots).toEqual([
        { start_at: '2026-06-15T13:00:00.000Z', end_at: '2026-06-15T14:00:00.000Z' },
      ])
    })
  })

  describe('Pedido 6 (ISADI 2026-07-14/16) — color único para toda la tanda', () => {
    it('muestra el ColorSwatchPicker (una sola vez, no por sesión)', () => {
      render(<AgendarSesionModal {...baseProps} onClose={vi.fn()} />)
      expect(screen.getByText('Color para todas las sesiones de este paquete')).toBeInTheDocument()
      // 16 colores de la paleta + "Sin color" = 17 botones.
      expect(screen.getAllByRole('button', { name: /^Color #|^Sin color$/ })).toHaveLength(17)
    })

    it('sin elegir color, el POST no manda "color" en el body', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true, creadas: 1, skipped: [] }) })
      const user = userEvent.setup()
      render(<AgendarSesionModal {...baseProps} onClose={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'slot-1000' }))
      await user.click(screen.getByRole('button', { name: /agendar sesión/i }))

      await waitFor(() => expect(mockFetch).toHaveBeenCalled())
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body).not.toHaveProperty('color')
    })

    it('al elegir un color, TODAS las sesiones de la tanda viajan con ese color (a nivel request, no por slot)', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true, creadas: 2, skipped: [] }) })
      const user = userEvent.setup()
      render(<AgendarSesionModal {...baseProps} onClose={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'slot-1000' }))
      await user.click(screen.getByRole('button', { name: 'slot-1001' }))
      await user.click(screen.getByRole('button', { name: 'Color #00FFFF' }))
      await user.click(screen.getByRole('button', { name: /agendar 2 sesiones/i }))

      await waitFor(() => expect(mockFetch).toHaveBeenCalled())
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.color).toBe('#00FFFF')
      expect(body.slots).toHaveLength(2)
    })
  })
})
