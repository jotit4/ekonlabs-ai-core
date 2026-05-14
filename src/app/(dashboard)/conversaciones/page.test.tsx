import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ConversacionesPage from './page'

describe('ConversacionesPage', () => {
  it('muestra el mensaje de placeholder para seleccionar conversación', () => {
    render(<ConversacionesPage />)
    expect(screen.getByText('Seleccioná una conversación para ver el hilo')).toBeInTheDocument()
  })
})
