import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RealtimeDegradationBanner } from './RealtimeDegradationBanner'

describe('RealtimeDegradationBanner', () => {
  it('renderiza el mensaje de degradación', () => {
    render(<RealtimeDegradationBanner />)
    expect(
      screen.getByText(
        'Actualizaciones en tiempo real desconectadas. Recargá para ver cambios recientes.',
      ),
    ).toBeInTheDocument()
  })

  it('tiene role="status"', () => {
    render(<RealtimeDegradationBanner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
