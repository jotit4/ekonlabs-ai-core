import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { GCalDegradationBanner } from './GCalDegradationBanner'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  WifiOff: ({ 'aria-hidden': ariaHidden, className }: { 'aria-hidden'?: boolean; className?: string }) => (
    <svg data-testid="icon-wifi-off" aria-hidden={ariaHidden} className={className} />
  ),
  AlertCircle: ({ 'aria-hidden': ariaHidden, className }: { 'aria-hidden'?: boolean; className?: string }) => (
    <svg data-testid="icon-alert-circle" aria-hidden={ariaHidden} className={className} />
  ),
}))

describe('GCalDegradationBanner', () => {
  it('no renderiza cuando status === "healthy"', () => {
    const { container } = render(<GCalDegradationBanner status="healthy" />)
    expect(container.firstChild).toBeNull()
  })

  it('renderiza banner con texto correcto cuando status === "degraded"', () => {
    render(<GCalDegradationBanner status="degraded" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(
      screen.getByText('Actualizaciones de Google Calendar en pausa. Renovando...')
    ).toBeInTheDocument()
    expect(screen.getByTestId('icon-wifi-off')).toBeInTheDocument()
  })

  it('renderiza banner con texto neutro cuando status === "unknown"', () => {
    render(<GCalDegradationBanner status="unknown" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(
      screen.getByText('Estado de sincronización con Google Calendar desconocido.')
    ).toBeInTheDocument()
    expect(screen.getByTestId('icon-alert-circle')).toBeInTheDocument()
  })

  it('tiene role="status" y aria-live="polite" en el contenedor', () => {
    render(<GCalDegradationBanner status="degraded" />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveAttribute('aria-live', 'polite')
  })

  it('el banner de degradación es independiente del SyncStatusBanner — pueden coexistir', () => {
    // Renderizar ambos banners simultáneamente en el mismo contenedor
    render(
      <div>
        {/* Simular SyncStatusBanner existente con role="status" */}
        <div role="status" aria-live="polite" data-testid="sync-banner">
          Sincronización con Google Calendar pendiente
        </div>
        <GCalDegradationBanner status="degraded" />
      </div>
    )

    const statusElements = screen.getAllByRole('status')
    expect(statusElements).toHaveLength(2)
    expect(screen.getByTestId('sync-banner')).toBeInTheDocument()
    expect(
      screen.getByText('Actualizaciones de Google Calendar en pausa. Renovando...')
    ).toBeInTheDocument()
  })
})
