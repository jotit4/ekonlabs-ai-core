import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const {
  mockUseProfessionals,
  mockUseCreateProfessional,
  mockUseUpdateProfessional,
  mockUseUpdateProfessionalServices,
  mockUseServices,
  mockUseCreateProfessionalUser,
} = vi.hoisted(() => ({
  mockUseProfessionals: vi.fn(),
  mockUseCreateProfessional: vi.fn(),
  mockUseUpdateProfessional: vi.fn(),
  mockUseUpdateProfessionalServices: vi.fn(),
  mockUseServices: vi.fn(),
  mockUseCreateProfessionalUser: vi.fn(),
}))

vi.mock('@/hooks/use-professionals', () => ({
  useProfessionals: mockUseProfessionals,
}))

vi.mock('@/hooks/use-create-professional', () => ({
  useCreateProfessional: mockUseCreateProfessional,
}))

vi.mock('@/hooks/use-update-professional', () => ({
  useUpdateProfessional: mockUseUpdateProfessional,
}))

vi.mock('@/hooks/use-update-professional-services', () => ({
  useUpdateProfessionalServices: mockUseUpdateProfessionalServices,
}))

vi.mock('@/hooks/use-services', () => ({
  useServices: mockUseServices,
}))

vi.mock('@/components/profesionales/ProfessionalScheduleView', () => ({
  ProfessionalScheduleView: ({ professionalId }: { professionalId: string }) =>
    React.createElement('div', { 'data-testid': `schedule-view-${professionalId}` }),
}))

vi.mock('@/components/profesionales/BlockedTimesView', () => ({
  BlockedTimesView: ({ professionalId }: { professionalId: string }) =>
    React.createElement('div', { 'data-testid': `blocked-view-${professionalId}` }),
}))

vi.mock('@/hooks/use-create-professional-user', () => ({
  useCreateProfessionalUser: mockUseCreateProfessionalUser,
}))

vi.mock('@/components/profesionales/CreateUserModal', () => ({
  CreateUserModal: ({ professionalName, onClose }: { professionalName: string; onClose: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'create-user-modal' },
      `Modal para ${professionalName}`,
      React.createElement('button', { onClick: onClose }, 'Cerrar')
    ),
}))

import { ProfesionalesView } from './ProfesionalesView'

// ── Datos de ejemplo ──────────────────────────────────────────────────────────

const ACTIVE_PROFESSIONAL = {
  professional_id: 'prof-1',
  tenant_id: 'tenant-1',
  name: 'Dr. García',
  email: 'garcia@clinica.com',
  active: true,
  created_at: '2026-05-01T00:00:00Z',
  services: [{ service_id: 'svc-1', name: 'Kinesiología' }],
  linked_user_email: null,
}

const INACTIVE_PROFESSIONAL = {
  professional_id: 'prof-2',
  tenant_id: 'tenant-1',
  name: 'Dra. López',
  email: 'lopez@clinica.com',
  active: false,
  created_at: '2026-05-02T00:00:00Z',
  services: [],
  linked_user_email: null,
}

const PROFESSIONAL_WITH_USER = {
  ...ACTIVE_PROFESSIONAL,
  professional_id: 'prof-3',
  linked_user_email: 'garcia@login.com',
}

const AVAILABLE_SERVICES = [
  { service_id: 'svc-1', name: 'Kinesiología', active: true },
  { service_id: 'svc-2', name: 'Pilates', active: true },
]

// ── Default mock setup ────────────────────────────────────────────────────────

function setupDefaultMocks(professionals = [ACTIVE_PROFESSIONAL]) {
  mockUseProfessionals.mockReturnValue({
    professionals,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })

  const createMutateFn = vi.fn()
  mockUseCreateProfessional.mockReturnValue({
    mutate: createMutateFn,
    isPending: false,
    isError: false,
    isSuccess: false,
  })

  const updateMutateFn = vi.fn()
  mockUseUpdateProfessional.mockReturnValue({
    mutate: updateMutateFn,
    isPending: false,
  })

  const updateServicesMutateFn = vi.fn()
  mockUseUpdateProfessionalServices.mockReturnValue({
    mutate: updateServicesMutateFn,
    isPending: false,
  })

  mockUseServices.mockReturnValue({
    services: AVAILABLE_SERVICES,
    isPending: false,
  })

  mockUseCreateProfessionalUser.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  })

  return { createMutateFn, updateMutateFn, updateServicesMutateFn }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfesionalesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra skeleton cuando isPending: true', () => {
    mockUseProfessionals.mockReturnValue({ professionals: [], isPending: true, isError: false, refetch: vi.fn() })
    mockUseCreateProfessional.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseUpdateProfessional.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseUpdateProfessionalServices.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseServices.mockReturnValue({ services: [], isPending: false })
    mockUseCreateProfessionalUser.mockReturnValue({ mutate: vi.fn(), isPending: false })

    render(<ProfesionalesView />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByLabelText('Cargando profesionales')).toBeInTheDocument()
  })

  it('muestra banner de error cuando isError: true', () => {
    const refetchFn = vi.fn()
    mockUseProfessionals.mockReturnValue({ professionals: [], isPending: false, isError: true, refetch: refetchFn })
    mockUseCreateProfessional.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseUpdateProfessional.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseUpdateProfessionalServices.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseServices.mockReturnValue({ services: [], isPending: false })
    mockUseCreateProfessionalUser.mockReturnValue({ mutate: vi.fn(), isPending: false })

    render(<ProfesionalesView />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    const retryBtn = screen.getByText('Reintentar')
    fireEvent.click(retryBtn)
    expect(refetchFn).toHaveBeenCalled()
  })

  it('muestra lista de profesionales con nombre, email y servicios', () => {
    setupDefaultMocks([ACTIVE_PROFESSIONAL, INACTIVE_PROFESSIONAL])

    render(<ProfesionalesView />)

    expect(screen.getByText('Dr. García')).toBeInTheDocument()
    expect(screen.getByText('garcia@clinica.com')).toBeInTheDocument()
    expect(screen.getByText('Kinesiología')).toBeInTheDocument()
    expect(screen.getByText('Dra. López')).toBeInTheDocument()
    expect(screen.getByText('lopez@clinica.com')).toBeInTheDocument()
  })

  it('muestra "No hay profesionales configurados" si lista vacía', () => {
    setupDefaultMocks([])

    render(<ProfesionalesView />)

    expect(screen.getByText('No hay profesionales configurados')).toBeInTheDocument()
  })

  it('botón "Nuevo profesional" muestra el formulario al hacer click', () => {
    setupDefaultMocks([])

    render(<ProfesionalesView />)

    const btn = screen.getByText('Nuevo profesional')
    fireEvent.click(btn)

    expect(screen.getByLabelText('Formulario de nuevo profesional')).toBeInTheDocument()
    expect(screen.getByText('Nuevo profesional', { selector: 'h3' })).toBeInTheDocument()
  })

  it('formulario de creación llama useCreateProfessional.mutate al enviar', async () => {
    const { createMutateFn } = setupDefaultMocks([])
    mockUseServices.mockReturnValue({ services: [], isPending: false })

    render(<ProfesionalesView />)

    fireEvent.click(screen.getByText('Nuevo profesional'))

    const nameInput = screen.getByLabelText(/^Nombre/)
    const emailInput = screen.getByLabelText(/^Email/)

    fireEvent.change(nameInput, { target: { value: 'Dr. Nuevo' } })
    fireEvent.change(emailInput, { target: { value: 'nuevo@clinica.com' } })

    const saveBtn = screen.getByText('Guardar')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(createMutateFn).toHaveBeenCalled()
    })
  })

  it('botón "Desactivar" muestra confirmación antes de ejecutar', () => {
    const { updateMutateFn } = setupDefaultMocks([ACTIVE_PROFESSIONAL])

    render(<ProfesionalesView />)

    // Primer click — muestra confirmación, NO llama mutate
    const deactivateBtn = screen.getByText('Desactivar')
    fireEvent.click(deactivateBtn)

    expect(updateMutateFn).not.toHaveBeenCalled()
    expect(screen.getByText('¿Confirmar?')).toBeInTheDocument()
    expect(screen.getByText('Cancelar')).toBeInTheDocument()

    // Segundo click en "¿Confirmar?" — ejecuta la mutación
    fireEvent.click(screen.getByText('¿Confirmar?'))

    expect(updateMutateFn).toHaveBeenCalledWith({
      id: ACTIVE_PROFESSIONAL.professional_id,
      payload: { active: false },
    })
  })

  it('el profesional inactivo muestra "Inactivo" en el estado', () => {
    setupDefaultMocks([INACTIVE_PROFESSIONAL])

    render(<ProfesionalesView />)

    expect(screen.getByText('Inactivo')).toBeInTheDocument()
  })

  it('profesional activo muestra "Activo" y profesional inactivo muestra "Inactivo"', () => {
    setupDefaultMocks([ACTIVE_PROFESSIONAL, INACTIVE_PROFESSIONAL])

    render(<ProfesionalesView />)

    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
  })

  it('muestra botón "Crear cuenta de usuario" cuando el profesional no tiene usuario vinculado', () => {
    setupDefaultMocks([ACTIVE_PROFESSIONAL])  // linked_user_email: null

    render(<ProfesionalesView />)

    expect(
      screen.getByTestId(`create-user-btn-${ACTIVE_PROFESSIONAL.professional_id}`)
    ).toBeInTheDocument()
  })

  it('muestra el email vinculado en lugar del botón cuando el profesional ya tiene usuario', () => {
    setupDefaultMocks([PROFESSIONAL_WITH_USER])  // linked_user_email: 'garcia@login.com'

    render(<ProfesionalesView />)

    expect(
      screen.queryByTestId(`create-user-btn-${PROFESSIONAL_WITH_USER.professional_id}`)
    ).toBeNull()
    expect(
      screen.getByTestId(`linked-user-email-${PROFESSIONAL_WITH_USER.professional_id}`)
    ).toHaveTextContent('garcia@login.com')
  })

  it('abre el modal al hacer click en "Crear cuenta de usuario"', async () => {
    setupDefaultMocks([ACTIVE_PROFESSIONAL])

    render(<ProfesionalesView />)

    fireEvent.click(screen.getByTestId(`create-user-btn-${ACTIVE_PROFESSIONAL.professional_id}`))

    await waitFor(() => {
      expect(screen.getByTestId('create-user-modal')).toBeInTheDocument()
    })
  })

  it('cierra el modal al llamar onClose', async () => {
    setupDefaultMocks([ACTIVE_PROFESSIONAL])

    render(<ProfesionalesView />)

    fireEvent.click(screen.getByTestId(`create-user-btn-${ACTIVE_PROFESSIONAL.professional_id}`))

    await waitFor(() => {
      expect(screen.getByTestId('create-user-modal')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Cerrar'))

    await waitFor(() => {
      expect(screen.queryByTestId('create-user-modal')).toBeNull()
    })
  })
})
