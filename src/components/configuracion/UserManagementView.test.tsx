import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { UserManagementView } from './UserManagementView'
import type { DashboardUser, UserRole } from '@/types/index'

// Mock use-current-tenant
const mockUseCurrentTenant = vi.fn(() => ({
  tenantId: 'tenant-abc',
  role: 'admin' as UserRole,
  loading: false,
}))

vi.mock('@/hooks/use-current-tenant', () => ({
  useCurrentTenant: () => mockUseCurrentTenant(),
}))

// Mock use-user-management
const mockRefetch = vi.fn()
const mockToggleUserStatus = vi.fn()
const mockUseUserManagement = vi.fn()

vi.mock('@/hooks/use-user-management', () => ({
  useUserManagement: () => mockUseUserManagement(),
}))

// Mock UserCreateForm to avoid nested form complexity in these tests
vi.mock('./UserCreateForm', () => ({
  UserCreateForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <div data-testid="user-create-form">
      <button onClick={onSuccess}>mock-invite</button>
    </div>
  ),
}))

const MOCK_USERS: DashboardUser[] = [
  {
    id: 'row-1',
    user_id: 'user-1',
    tenant_id: 'tenant-abc',
    role: 'receptionist',
    is_active: true,
    full_name: 'Ana García',
    email: 'ana@clinica.com',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'row-2',
    user_id: 'user-2',
    tenant_id: 'tenant-abc',
    role: 'doctor',
    is_active: false,
    full_name: 'Carlos López',
    email: 'carlos@clinica.com',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
]

describe('UserManagementView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCurrentTenant.mockReturnValue({ tenantId: 'tenant-abc', role: 'admin', loading: false })
  })

  it('renderiza skeleton mientras isLoading=true', () => {
    mockUseUserManagement.mockReturnValue({
      users: [],
      isLoading: true,
      isError: false,
      refetch: mockRefetch,
      toggleUserStatus: mockToggleUserStatus,
      isToggling: null,
      currentUserId: 'admin-user',
    })

    render(<UserManagementView />)
    expect(screen.getByRole('status', { name: /cargando usuarios/i })).toBeInTheDocument()
  })

  it('renderiza tabla con datos de usuarios cuando la query resuelve', () => {
    mockUseUserManagement.mockReturnValue({
      users: MOCK_USERS,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      toggleUserStatus: mockToggleUserStatus,
      isToggling: null,
      currentUserId: 'admin-user',
    })

    render(<UserManagementView />)
    expect(screen.getByText('Ana García')).toBeInTheDocument()
    expect(screen.getByText('ana@clinica.com')).toBeInTheDocument()
    expect(screen.getByText('Carlos López')).toBeInTheDocument()
    expect(screen.getByText('carlos@clinica.com')).toBeInTheDocument()
  })

  it('muestra estado Activo e Inactivo correctamente', () => {
    mockUseUserManagement.mockReturnValue({
      users: MOCK_USERS,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      toggleUserStatus: mockToggleUserStatus,
      isToggling: null,
      currentUserId: 'admin-user',
    })

    render(<UserManagementView />)
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
  })

  it('el botón "Desactivar" llama a toggleUserStatus con is_active=false', async () => {
    const user = userEvent.setup()
    mockUseUserManagement.mockReturnValue({
      users: MOCK_USERS,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      toggleUserStatus: mockToggleUserStatus,
      isToggling: null,
      currentUserId: 'admin-user',
    })

    render(<UserManagementView />)

    // Ana García está activa — tiene botón Desactivar (exacto)
    const desactivarBtn = screen.getByRole('button', { name: 'Desactivar' })
    await user.click(desactivarBtn)

    expect(mockToggleUserStatus).toHaveBeenCalledWith('user-1', false)
  })

  it('el botón "Activar" llama a toggleUserStatus con is_active=true', async () => {
    const user = userEvent.setup()
    mockUseUserManagement.mockReturnValue({
      users: MOCK_USERS,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      toggleUserStatus: mockToggleUserStatus,
      isToggling: null,
      currentUserId: 'admin-user',
    })

    render(<UserManagementView />)

    // Carlos López está inactivo — tiene botón "Activar" (exacto, no "Desactivar")
    const activarBtn = screen.getByRole('button', { name: 'Activar' })
    await user.click(activarBtn)

    expect(mockToggleUserStatus).toHaveBeenCalledWith('user-2', true)
  })

  it('muestra error inline con botón Reintentar cuando isError=true', () => {
    mockUseUserManagement.mockReturnValue({
      users: [],
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
      toggleUserStatus: mockToggleUserStatus,
      isToggling: null,
      currentUserId: 'admin-user',
    })

    render(<UserManagementView />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('llama a refetch al hacer click en Reintentar', async () => {
    const user = userEvent.setup()
    mockUseUserManagement.mockReturnValue({
      users: [],
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
      toggleUserStatus: mockToggleUserStatus,
      isToggling: null,
      currentUserId: 'admin-user',
    })

    render(<UserManagementView />)
    await user.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(mockRefetch).toHaveBeenCalledOnce()
  })

  it('no muestra botón de toggle para el usuario actual (isSelf)', () => {
    mockUseUserManagement.mockReturnValue({
      users: MOCK_USERS,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      toggleUserStatus: mockToggleUserStatus,
      isToggling: null,
      currentUserId: 'user-1', // user-1 = Ana García = el usuario actual
    })

    render(<UserManagementView />)
    // Ana García no debe tener botón (es el usuario actual)
    expect(screen.getByText('(tú)')).toBeInTheDocument()
    // Solo Carlos López (inactivo) tiene botón Activar (exacto)
    expect(screen.getByRole('button', { name: 'Activar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
  })

  it('muestra "Acceso denegado" para roles no-admin', () => {
    mockUseCurrentTenant.mockReturnValue({ tenantId: 'tenant-abc', role: 'receptionist', loading: false })
    mockUseUserManagement.mockReturnValue({
      users: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      toggleUserStatus: mockToggleUserStatus,
      isToggling: null,
      currentUserId: 'user-x',
    })

    render(<UserManagementView />)
    expect(screen.getByRole('alert')).toHaveTextContent(/acceso denegado/i)
  })
})
