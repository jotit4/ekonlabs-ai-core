import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { OnboardingProvider, useOnboarding } from './OnboardingProvider'

// ─── Mocks ───────────────────────────────────────────────────────────────────

let mockPathname = '/conversaciones'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

const driveMock = vi.fn()
const destroyMock = vi.fn()
const driverFactoryMock = vi.fn((config?: unknown) => {
  void config
  return { drive: driveMock, destroy: destroyMock }
})
vi.mock('driver.js', () => ({
  driver: (config?: unknown) => driverFactoryMock(config),
}))
vi.mock('driver.js/dist/driver.css', () => ({}))

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('OnboardingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mockPathname = '/conversaciones'
  })

  it('receptionist en /conversaciones → renderiza el botón "?" persistente', () => {
    render(
      <OnboardingProvider role="receptionist">
        <div>contenido</div>
      </OnboardingProvider>
    )
    expect(
      screen.getByRole('button', { name: /ayuda: ver guía de conversaciones/i })
    ).toBeInTheDocument()
  })

  it('doctor (sin tour para la ruta) → NO renderiza el botón "?"', () => {
    render(
      <OnboardingProvider role="doctor">
        <div>contenido</div>
      </OnboardingProvider>
    )
    expect(screen.queryByRole('button', { name: /ayuda/i })).toBeNull()
  })

  it('click en "?" → crea el driver con los pasos del tour y lo lanza', async () => {
    window.localStorage.setItem('ekonlabs:tour-seen:conversaciones', '1')
    const user = userEvent.setup()
    render(
      <OnboardingProvider role="receptionist">
        <div>contenido</div>
      </OnboardingProvider>
    )
    await user.click(screen.getByRole('button', { name: /ayuda/i }))
    expect(driverFactoryMock).toHaveBeenCalledTimes(1)
    const config = driverFactoryMock.mock.calls[0]?.[0] as { steps?: unknown[] } | undefined
    expect(config?.steps?.length).toBeGreaterThan(0)
    expect(driveMock).toHaveBeenCalledTimes(1)
  })

  it('primera visita → auto-dispara el tour y lo marca como visto', async () => {
    render(
      <OnboardingProvider role="receptionist">
        <div>contenido</div>
      </OnboardingProvider>
    )
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(
      window.localStorage.getItem('ekonlabs:tour-seen:conversaciones')
    ).toBe('1')
  })

  it('tour ya visto → NO auto-dispara', async () => {
    window.localStorage.setItem('ekonlabs:tour-seen:conversaciones', '1')
    render(
      <OnboardingProvider role="receptionist">
        <div>contenido</div>
      </OnboardingProvider>
    )
    // Esperar más que el delay de auto-disparo (600ms) y verificar que no corrió
    await new Promise((r) => setTimeout(r, 800))
    expect(driveMock).not.toHaveBeenCalled()
  })

  it('useOnboarding expone hasTour según rol + ruta', () => {
    function Probe() {
      const { hasTour } = useOnboarding()
      return <span data-testid="has-tour">{String(hasTour)}</span>
    }
    window.localStorage.setItem('ekonlabs:tour-seen:conversaciones', '1')
    render(
      <OnboardingProvider role="receptionist">
        <Probe />
      </OnboardingProvider>
    )
    expect(screen.getByTestId('has-tour')).toHaveTextContent('true')
  })
})
