import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Appointment } from '@/types/appointments'
import { AbsenceDecisionDialog } from './AbsenceDecisionDialog'

const SERIE_APPOINTMENT: Appointment = {
  appointment_id: 'apt-1',
  tenant_id: 'tenant-1',
  phone_number: '+541100000000',
  patient_id: 'pat-1',
  service_id: 'svc-1',
  professional_id: null,
  appointment_time: '2026-05-07T09:00:00',
  start_at: '2026-05-07T09:00:00',
  end_at: '2026-05-07T10:00:00',
  status: 'confirmed',
  calendar_event_id: null,
  reminder_sent_at: null,
  attendance_confirmed: null,
  created_at: '2026-05-01T00:00:00.000Z',
  package_id: 'trt-1',
  session_index: 3,
  treatments: { total_sessions: 10, status: 'active' },
  patients: { full_name: 'Juan García' },
  services: { name: 'Kinesiología', professional: 'Dra. Pérez' },
  professionals: null,
}

const onConfirm = vi.fn()
const onClose = vi.fn()

function renderDialog(overrides: Partial<React.ComponentProps<typeof AbsenceDecisionDialog>> = {}) {
  return render(
    <AbsenceDecisionDialog
      appointment={SERIE_APPOINTMENT}
      action="no_show"
      onConfirm={onConfirm}
      onClose={onClose}
      isLoading={false}
      error={null}
      {...overrides}
    />
  )
}

describe('AbsenceDecisionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza las 3 opciones', () => {
    renderDialog()
    expect(screen.getByRole('radio', { name: /recuperar/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /consumir/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /justificar con nota/i })).toBeInTheDocument()
  })

  it('NINGUNA opción está pre-seleccionada', () => {
    renderDialog()
    const radios = screen.getAllByRole('radio')
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true)
  })

  it('el botón Confirmar está deshabilitado hasta elegir una opción', async () => {
    const user = userEvent.setup()
    renderDialog()
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i })
    expect(confirmBtn).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: /recuperar/i }))
    expect(confirmBtn).toBeEnabled()
  })

  it('muestra el contador del paquete cuando treatments está disponible', () => {
    renderDialog()
    expect(screen.getByText(/10 sesiones en total/i)).toBeInTheDocument()
    expect(screen.getByText(/sesión 3/i)).toBeInTheDocument()
  })

  it('"Recuperar" → onConfirm con decision "recover" y sin nota', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('radio', { name: /recuperar/i }))
    await user.click(screen.getByRole('button', { name: /confirmar/i }))
    expect(onConfirm).toHaveBeenCalledWith('recover', undefined)
  })

  it('"Consumir" → onConfirm con decision "consume" y sin nota', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('radio', { name: /consumir/i }))
    await user.click(screen.getByRole('button', { name: /confirmar/i }))
    expect(onConfirm).toHaveBeenCalledWith('consume', undefined)
  })

  it('el textarea de motivo aparece SOLO al elegir "Justificar"', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.queryByRole('textbox', { name: /motivo/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /justificar con nota/i }))
    expect(screen.getByRole('textbox', { name: /motivo/i })).toBeInTheDocument()
  })

  it('"Justificar" con textarea vacío deja Confirmar deshabilitado', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('radio', { name: /justificar con nota/i }))
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled()
  })

  it('"Justificar" con nota → onConfirm con decision "justify" y el motivo', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('radio', { name: /justificar con nota/i }))
    await user.type(screen.getByRole('textbox', { name: /motivo/i }), 'aviso anticipado')
    await user.click(screen.getByRole('button', { name: /confirmar/i }))
    expect(onConfirm).toHaveBeenCalledWith('justify', 'aviso anticipado')
  })

  it('muestra el error cuando se pasa la prop error', () => {
    renderDialog({ error: 'Algo falló' })
    expect(screen.getByRole('alert')).toHaveTextContent('Algo falló')
  })

  it('botón Confirmar deshabilitado mientras isLoading', async () => {
    const user = userEvent.setup()
    const { rerender } = renderDialog()
    await user.click(screen.getByRole('radio', { name: /recuperar/i }))
    rerender(
      <AbsenceDecisionDialog
        appointment={SERIE_APPOINTMENT}
        action="no_show"
        onConfirm={onConfirm}
        onClose={onClose}
        isLoading={true}
        error={null}
      />
    )
    expect(screen.getByRole('button', { name: /aplicando/i })).toBeDisabled()
  })

  it('llama onClose al hacer click en Cancelar', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('indica la acción en curso (cancelar / no-show)', () => {
    renderDialog({ action: 'cancelled' })
    expect(screen.getByText(/cancelar el turno de/i)).toBeInTheDocument()
  })
})
