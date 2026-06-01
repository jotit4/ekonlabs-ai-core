import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const {
  mockUseServices,
  mockUseCreateService,
  mockUseUpdateService,
} = vi.hoisted(() => ({
  mockUseServices: vi.fn(),
  mockUseCreateService: vi.fn(),
  mockUseUpdateService: vi.fn(),
}))

vi.mock('@/hooks/use-services', () => ({
  useServices: mockUseServices,
}))

vi.mock('@/hooks/use-create-service', () => ({
  useCreateService: mockUseCreateService,
}))

vi.mock('@/hooks/use-update-service', () => ({
  useUpdateService: mockUseUpdateService,
}))

import { ServicesView } from './ServicesView'

// ── Datos de ejemplo ──────────────────────────────────────────────────────────

const ACTIVE_SERVICE = {
  service_id: 'svc-1',
  tenant_id: 'tenant-1',
  name: 'Kinesiología',
  calendar_id: 'kin@cal.com',
  professional_name: 'Patricia Pérez',
  duration_minutes: 60,
  active: true,
  booking_mode: 'gated' as const,
  capacity_per_slot: null,
  requires_prescription: false,
  is_referral_only: false,
  reminder_hours_before: null,
  reminder_instructions: null,
  prerequisite_note: null,
  created_at: '2026-05-01T00:00:00Z',
}

const INACTIVE_SERVICE = {
  ...ACTIVE_SERVICE,
  service_id: 'svc-2',
  name: 'Pilates Terapéutico',
  professional_name: null,
  active: false,
  calendar_id: 'pilates@cal.com',
}

// ── Default mock retorno ──────────────────────────────────────────────────────

function setupDefaultMocks() {
  mockUseServices.mockReturnValue({
    services: [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })

  const mutateFn = vi.fn()
  mockUseCreateService.mockReturnValue({
    mutate: mutateFn,
    isPending: false,
    isError: false,
    isSuccess: false,
  })

  const updateMutateFn = vi.fn()
  mockUseUpdateService.mockReturnValue({
    mutate: updateMutateFn,
    isPending: false,
  })

  return { mutateFn, updateMutateFn }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ServicesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra skeleton cuando isPending: true', () => {
    mockUseServices.mockReturnValue({ services: [], isPending: true, isError: false, refetch: vi.fn() })
    mockUseCreateService.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseUpdateService.mockReturnValue({ mutate: vi.fn(), isPending: false })

    render(<ServicesView />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByLabelText('Cargando servicios')).toBeInTheDocument()
  })

  it('muestra banner de error + "Reintentar" cuando isError: true', () => {
    const refetchFn = vi.fn()
    mockUseServices.mockReturnValue({ services: [], isPending: false, isError: true, refetch: refetchFn })
    mockUseCreateService.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseUpdateService.mockReturnValue({ mutate: vi.fn(), isPending: false })

    render(<ServicesView />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    const retryBtn = screen.getByText('Reintentar')
    fireEvent.click(retryBtn)
    expect(refetchFn).toHaveBeenCalled()
  })

  it('muestra "No hay servicios configurados" cuando services: []', () => {
    setupDefaultMocks()

    render(<ServicesView />)

    expect(screen.getByText('No hay servicios configurados')).toBeInTheDocument()
  })

  it('renderiza lista de servicios con nombre, profesional, duración, calendar_id y estado', () => {
    setupDefaultMocks()
    mockUseServices.mockReturnValue({
      services: [ACTIVE_SERVICE, INACTIVE_SERVICE],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<ServicesView />)

    expect(screen.getByText('Kinesiología')).toBeInTheDocument()
    expect(screen.getByText('Pilates Terapéutico')).toBeInTheDocument()
    // Profesional y duración — pueden haber múltiples filas con 60min
    expect(screen.getByText(/Patricia Pérez/)).toBeInTheDocument()
    expect(screen.getAllByText(/60min/).length).toBeGreaterThan(0)
    // calendar_id visible en la fila
    expect(screen.getByText(/Cal: kin@cal\.com/)).toBeInTheDocument()
  })

  it('servicio activo muestra "Activo"; inactivo muestra "Inactivo"', () => {
    setupDefaultMocks()
    mockUseServices.mockReturnValue({
      services: [ACTIVE_SERVICE, INACTIVE_SERVICE],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<ServicesView />)

    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
  })

  it('botón "Agregar servicio" muestra el formulario de creación', () => {
    setupDefaultMocks()

    render(<ServicesView />)

    const btn = screen.getByText('Agregar servicio')
    fireEvent.click(btn)

    expect(screen.getByLabelText('Formulario de nuevo servicio')).toBeInTheDocument()
    expect(screen.getByText('Nuevo servicio')).toBeInTheDocument()
  })

  it('submit del formulario de creación llama useCreateService.mutate', async () => {
    const { mutateFn } = setupDefaultMocks()

    render(<ServicesView />)

    fireEvent.click(screen.getByText('Agregar servicio'))

    const nameInput = screen.getByLabelText(/^Nombre/)
    const calendarInput = screen.getByLabelText(/ID del Calendario Google/)

    fireEvent.change(nameInput, { target: { value: 'Nuevo Servicio' } })
    fireEvent.change(calendarInput, { target: { value: 'nuevo@cal.com' } })

    const saveBtn = screen.getByText('Guardar')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mutateFn).toHaveBeenCalled()
    })
  })

  it('botón "Editar" muestra el formulario inline con datos precargados', () => {
    setupDefaultMocks()
    mockUseServices.mockReturnValue({
      services: [ACTIVE_SERVICE],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<ServicesView />)

    const editBtn = screen.getByText('Editar')
    fireEvent.click(editBtn)

    const editForm = screen.getByLabelText(`Editar servicio ${ACTIVE_SERVICE.name}`)
    expect(editForm).toBeInTheDocument()

    // Datos precargados
    const nameInput = screen.getByDisplayValue('Kinesiología')
    expect(nameInput).toBeInTheDocument()
  })

  it('botón "Desactivar" muestra confirmación antes de ejecutar la mutación', () => {
    const { updateMutateFn } = setupDefaultMocks()
    mockUseServices.mockReturnValue({
      services: [ACTIVE_SERVICE],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<ServicesView />)

    // Primer click — debe mostrar botones de confirmación, NO llamar mutate aún
    const deactivateBtn = screen.getByText('Desactivar')
    fireEvent.click(deactivateBtn)

    expect(updateMutateFn).not.toHaveBeenCalled()
    expect(screen.getByText('¿Confirmar?')).toBeInTheDocument()
    expect(screen.getByText('Cancelar')).toBeInTheDocument()

    // Segundo click en "¿Confirmar?" — ejecuta la mutación
    fireEvent.click(screen.getByText('¿Confirmar?'))

    expect(updateMutateFn).toHaveBeenCalledWith({
      id: ACTIVE_SERVICE.service_id,
      payload: { active: false },
    })
  })

  it('botón "Cancelar" en confirmación de desactivación no ejecuta la mutación', () => {
    const { updateMutateFn } = setupDefaultMocks()
    mockUseServices.mockReturnValue({
      services: [ACTIVE_SERVICE],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<ServicesView />)

    // Abrir confirmación
    fireEvent.click(screen.getByText('Desactivar'))
    expect(screen.getByText('¿Confirmar?')).toBeInTheDocument()

    // Cancelar confirmación
    fireEvent.click(screen.getByText('Cancelar'))

    expect(updateMutateFn).not.toHaveBeenCalled()
    // Vuelve a mostrar el botón "Desactivar"
    expect(screen.getByText('Desactivar')).toBeInTheDocument()
    expect(screen.queryByText('¿Confirmar?')).not.toBeInTheDocument()
  })

  // ── Story 12.5: campos de recordatorio ────────────────────────────────────

  const SERVICE_WITH_REMINDER = {
    ...ACTIVE_SERVICE,
    service_id: 'svc-rem',
    name: 'Consulta con estudios',
    reminder_hours_before: 24,
    reminder_instructions: 'Traer estudios previos',
  }

  it('el formulario de creación muestra los inputs de recordatorio', () => {
    setupDefaultMocks()

    render(<ServicesView />)
    fireEvent.click(screen.getByText('Agregar servicio'))

    expect(screen.getByLabelText(/Recordatorio \(horas antes\)/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Instrucciones de recordatorio/)).toBeInTheDocument()
  })

  it('el formulario de edición precarga los valores de recordatorio (AC1/AC2)', () => {
    setupDefaultMocks()
    mockUseServices.mockReturnValue({
      services: [SERVICE_WITH_REMINDER],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<ServicesView />)
    fireEvent.click(screen.getByText('Editar'))

    expect(screen.getByDisplayValue('24')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Traer estudios previos')).toBeInTheDocument()
  })

  it('precarga vacío cuando el servicio no tiene recordatorio (sin "null")', () => {
    setupDefaultMocks()
    mockUseServices.mockReturnValue({
      services: [ACTIVE_SERVICE],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<ServicesView />)
    fireEvent.click(screen.getByText('Editar'))

    const hoursInput = screen.getByLabelText(/Recordatorio \(horas antes\)/) as HTMLInputElement
    const instrInput = screen.getByLabelText(/Instrucciones de recordatorio/) as HTMLTextAreaElement
    expect(hoursInput.value).toBe('')
    expect(instrInput.value).toBe('')
  })

  it('submit de edición con valores envía reminder_hours_before + reminder_instructions (AC2)', async () => {
    const { updateMutateFn } = setupDefaultMocks()
    mockUseServices.mockReturnValue({
      services: [SERVICE_WITH_REMINDER],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<ServicesView />)
    fireEvent.click(screen.getByText('Editar'))
    fireEvent.click(screen.getByText('Guardar'))

    await waitFor(() => {
      expect(updateMutateFn).toHaveBeenCalled()
    })
    const arg = updateMutateFn.mock.calls[0][0]
    expect(arg.payload.reminder_hours_before).toBe(24)
    expect(arg.payload.reminder_instructions).toBe('Traer estudios previos')
  })

  it('limpiar los campos en edición envía null explícito (AC3)', async () => {
    const { updateMutateFn } = setupDefaultMocks()
    mockUseServices.mockReturnValue({
      services: [SERVICE_WITH_REMINDER],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<ServicesView />)
    fireEvent.click(screen.getByText('Editar'))

    fireEvent.change(screen.getByLabelText(/Recordatorio \(horas antes\)/), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/Instrucciones de recordatorio/), { target: { value: '' } })
    fireEvent.click(screen.getByText('Guardar'))

    await waitFor(() => {
      expect(updateMutateFn).toHaveBeenCalled()
    })
    const arg = updateMutateFn.mock.calls[0][0]
    expect(arg.payload.reminder_hours_before).toBeNull()
    expect(arg.payload.reminder_instructions).toBeNull()
  })

  it('botón "Cancelar" en edición cierra sin llamar mutate', () => {
    const { updateMutateFn } = setupDefaultMocks()
    mockUseServices.mockReturnValue({
      services: [ACTIVE_SERVICE],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<ServicesView />)

    // Abrir edición
    fireEvent.click(screen.getByText('Editar'))
    expect(screen.getByLabelText(`Editar servicio ${ACTIVE_SERVICE.name}`)).toBeInTheDocument()

    // Cancelar
    const cancelBtn = screen.getByText('Cancelar')
    fireEvent.click(cancelBtn)

    // El formulario de edición ya no debe estar visible
    expect(screen.queryByLabelText(`Editar servicio ${ACTIVE_SERVICE.name}`)).not.toBeInTheDocument()
    // mutate no fue llamado
    expect(updateMutateFn).not.toHaveBeenCalled()
  })
})
