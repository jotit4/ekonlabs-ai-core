import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { UserProfileButton } from './UserProfileButton'
import type { CurrentUser } from '@/hooks/use-current-user'

// ───── Mocks ─────

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockSignOut = vi.fn().mockResolvedValue({})
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signOut: mockSignOut },
  }),
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}))

// Función de fábrica para usar en beforeEach
let mockUseCurrentUserFn: () => { user: CurrentUser | null; isLoading: boolean }

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => mockUseCurrentUserFn(),
}))

// ───── Helpers ─────

const adminUser: CurrentUser = {
  fullName: 'Patricia Pérez',
  email: 'patricia@isadi.com',
  role: 'admin',
  initials: 'PP',
}

const doctorUser: CurrentUser = {
  fullName: 'Dr House',
  email: 'house@isadi.com',
  role: 'doctor',
  initials: 'DH',
}

const receptionistUser: CurrentUser = {
  fullName: 'Laura García',
  email: 'laura@isadi.com',
  role: 'receptionist',
  initials: 'LG',
}

// ───── Tests ─────

describe('UserProfileButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cuando isLoading=true, muestra skeleton (elemento con clase animate-pulse)', () => {
    mockUseCurrentUserFn = () => ({ user: null, isLoading: true })
    const { container } = render(<UserProfileButton collapsed={false} />)
    const skeleton = container.querySelector('.animate-pulse')
    expect(skeleton).not.toBeNull()
  })

  it('cuando collapsed=false, muestra nombre y rol del usuario', () => {
    mockUseCurrentUserFn = () => ({ user: adminUser, isLoading: false })
    render(<UserProfileButton collapsed={false} />)
    // Puede aparecer en trigger y popover, por eso usamos getAllByText
    expect(screen.getAllByText('Patricia Pérez').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Administrador').length).toBeGreaterThan(0)
  })

  it('cuando collapsed=true, NO muestra nombre en el botón trigger (solo iniciales)', () => {
    mockUseCurrentUserFn = () => ({ user: adminUser, isLoading: false })
    render(<UserProfileButton collapsed={true} />)
    // El nombre/email NO deben estar en el trigger (botón de perfil colapsado)
    // Con collapsed=true, el componente no renderiza el bloque de texto expandido
    // El popover siempre existe en el DOM con nuestro mock — verificamos el trigger
    const trigger = screen.getByRole('button', { name: /abrir menú de perfil/i })
    expect(trigger.textContent).not.toContain('Patricia Pérez')
    expect(trigger.textContent).not.toContain('patricia@isadi.com')
    // Las iniciales sí están visibles en el trigger
    expect(trigger.textContent).toContain('PP')
  })

  it('el popover content muestra nombre, email y rol formateado', () => {
    mockUseCurrentUserFn = () => ({ user: adminUser, isLoading: false })
    render(<UserProfileButton collapsed={false} />)
    const popover = screen.getByTestId('popover-content')
    expect(popover.textContent).toContain('Patricia Pérez')
    expect(popover.textContent).toContain('patricia@isadi.com')
    expect(popover.textContent).toContain('Administrador')
  })

  it('al hacer click en "Cerrar sesión", llama supabase.auth.signOut()', async () => {
    mockUseCurrentUserFn = () => ({ user: adminUser, isLoading: false })
    const user = userEvent.setup()
    render(<UserProfileButton collapsed={false} />)
    const logoutBtn = screen.getByRole('button', { name: /cerrar sesión/i })
    await user.click(logoutBtn)
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('después de signOut(), llama router.push("/login")', async () => {
    mockUseCurrentUserFn = () => ({ user: adminUser, isLoading: false })
    const user = userEvent.setup()
    render(<UserProfileButton collapsed={false} />)
    const logoutBtn = screen.getByRole('button', { name: /cerrar sesión/i })
    await user.click(logoutBtn)
    // Esperar la promise
    await vi.waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    })
  })

  it('el rol admin se muestra como "Administrador"', () => {
    mockUseCurrentUserFn = () => ({ user: adminUser, isLoading: false })
    render(<UserProfileButton collapsed={false} />)
    // En el trigger (expandido) y en el popover
    const adminTexts = screen.getAllByText('Administrador')
    expect(adminTexts.length).toBeGreaterThan(0)
  })

  it('el rol doctor se muestra como "Médico"', () => {
    mockUseCurrentUserFn = () => ({ user: doctorUser, isLoading: false })
    render(<UserProfileButton collapsed={false} />)
    const medicoTexts = screen.getAllByText('Médico')
    expect(medicoTexts.length).toBeGreaterThan(0)
  })

  it('el rol receptionist se muestra como "Recepcionista"', () => {
    mockUseCurrentUserFn = () => ({ user: receptionistUser, isLoading: false })
    render(<UserProfileButton collapsed={false} />)
    const receptionistTexts = screen.getAllByText('Recepcionista')
    expect(receptionistTexts.length).toBeGreaterThan(0)
  })
})
