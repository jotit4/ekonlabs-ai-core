import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PatientDeletionRequest } from './PatientDeletionRequest'

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  patientId: 'patient-uuid-1',
  patientName: 'Juan Pérez',
  patientDni: '30123456',
  onSuccess: vi.fn(),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PatientDeletionRequest', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, deletion_effective_at: '2026-06-10T00:00:00Z' }),
      })
    )
    defaultProps.onSuccess = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renderiza el botón trigger "Solicitar eliminación"', () => {
    render(<PatientDeletionRequest {...defaultProps} />)
    expect(screen.getByRole('button', { name: /solicitar eliminación/i })).toBeInTheDocument()
  })

  it('al hacer clic en el trigger, abre el dialog', async () => {
    const user = userEvent.setup()
    render(<PatientDeletionRequest {...defaultProps} />)

    const trigger = screen.getByRole('button', { name: /solicitar eliminación/i })
    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('el dialog muestra el nombre y DNI del paciente', async () => {
    const user = userEvent.setup()
    render(<PatientDeletionRequest {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /solicitar eliminación/i }))

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
      expect(screen.getByText(/DNI: 30123456/i)).toBeInTheDocument()
    })
  })

  it('DNI null muestra "—" en el dialog', async () => {
    const user = userEvent.setup()
    render(<PatientDeletionRequest {...defaultProps} patientDni={null} />)

    await user.click(screen.getByRole('button', { name: /solicitar eliminación/i }))

    await waitFor(() => {
      expect(screen.getByText(/DNI: —/i)).toBeInTheDocument()
    })
  })

  it('botón "Cancelar" cierra el dialog sin llamar fetch', async () => {
    const user = userEvent.setup()
    render(<PatientDeletionRequest {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /solicitar eliminación/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const cancelBtn = screen.getByRole('button', { name: /cancelar/i })
    await user.click(cancelBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('confirmar éxito → cierra dialog y llama onSuccess', async () => {
    const user = userEvent.setup()
    render(<PatientDeletionRequest {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /solicitar eliminación/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const confirmBtn = screen.getByRole('button', { name: /confirmar eliminación/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1)
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/patients/patient-uuid-1/deletion-request',
      { method: 'POST' }
    )
  })

  it('error del fetch → muestra mensaje de error inline, NO cierra el dialog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Este paciente ya tiene una eliminación pendiente' }),
      })
    )

    const user = userEvent.setup()
    render(<PatientDeletionRequest {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /solicitar eliminación/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const confirmBtn = screen.getByRole('button', { name: /confirmar eliminación/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(
        screen.getByText('Este paciente ya tiene una eliminación pendiente')
      ).toBeInTheDocument()
    })

    // El dialog sigue abierto
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // onSuccess NO fue llamado
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  it('mientras submitting, ambos botones del footer están deshabilitados', async () => {
    // fetch que nunca resuelve para mantener el estado submitting
    let resolvePromise!: (value: unknown) => void
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(pendingPromise)
    )

    const user = userEvent.setup()
    render(<PatientDeletionRequest {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /solicitar eliminación/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const confirmBtn = screen.getByRole('button', { name: /confirmar eliminación/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      // El botón confirmar cambia a "Solicitando..."
      expect(screen.getByRole('button', { name: /solicitando.../i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeDisabled()
    })

    // Cleanup: resolver el promise para no dejar promesas pendientes
    resolvePromise({
      ok: true,
      json: async () => ({ success: true, deletion_effective_at: '2026-06-10T00:00:00Z' }),
    })
  })
})
