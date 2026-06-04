import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/hooks/use-profesionales', () => ({
  useProfesionales: () => ({
    profesionales: [
      { professional_id: 'prof-1', name: 'Patricia Pérez Bernal' },
      { professional_id: 'prof-2', name: 'Aldo Luque' },
    ],
    isPending: false,
    isError: false,
  }),
}))

vi.mock('@refinedev/core', () => ({
  useList: () => ({
    result: {
      data: [
        { service_id: 'svc-1', name: 'Kinesiología' },
        { service_id: 'svc-2', name: 'Pediatría' },
      ],
    },
  }),
}))

import { AgendaFilters } from './AgendaFilters'

const defaultProps = {
  professionalId: null,
  serviceId: null,
  onProfessionalChange: vi.fn(),
  onServiceChange: vi.fn(),
  onClear: vi.fn(),
  showFilters: true,
}

describe('AgendaFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza los selectores cuando showFilters=true', () => {
    render(<AgendaFilters {...defaultProps} />)
    expect(screen.getByLabelText('Filtrar por profesional')).toBeInTheDocument()
    expect(screen.getByLabelText('Filtrar por servicio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /limpiar/i })).toBeInTheDocument()
  })

  it('NO renderiza nada cuando showFilters=false', () => {
    render(<AgendaFilters {...defaultProps} showFilters={false} />)
    expect(screen.queryByLabelText('Filtrar por profesional')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filtrar por servicio')).not.toBeInTheDocument()
  })

  it('llama onProfessionalChange al cambiar el selector de profesional', () => {
    const onProfessionalChange = vi.fn()
    render(<AgendaFilters {...defaultProps} onProfessionalChange={onProfessionalChange} />)
    const select = screen.getByLabelText('Filtrar por profesional')
    fireEvent.change(select, { target: { value: 'prof-1' } })
    expect(onProfessionalChange).toHaveBeenCalledWith('prof-1')
  })

  it('llama onServiceChange al cambiar el selector de servicio', () => {
    const onServiceChange = vi.fn()
    render(<AgendaFilters {...defaultProps} onServiceChange={onServiceChange} />)
    const select = screen.getByLabelText('Filtrar por servicio')
    fireEvent.change(select, { target: { value: 'svc-1' } })
    expect(onServiceChange).toHaveBeenCalledWith('svc-1')
  })

  it('botón "Limpiar" está deshabilitado cuando ambos filtros son null', () => {
    render(<AgendaFilters {...defaultProps} professionalId={null} serviceId={null} />)
    expect(screen.getByRole('button', { name: /limpiar/i })).toBeDisabled()
  })

  it('botón "Limpiar" está habilitado cuando hay al menos un filtro activo', () => {
    render(<AgendaFilters {...defaultProps} professionalId="prof-1" serviceId={null} />)
    expect(screen.getByRole('button', { name: /limpiar/i })).not.toBeDisabled()
  })

  it('llama onClear al hacer click en "Limpiar" con filtros activos', () => {
    const onClear = vi.fn()
    render(<AgendaFilters {...defaultProps} professionalId="prof-1" onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /limpiar/i }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('llama onProfessionalChange con null al seleccionar opción vacía', () => {
    const onProfessionalChange = vi.fn()
    render(
      <AgendaFilters
        {...defaultProps}
        professionalId="prof-1"
        onProfessionalChange={onProfessionalChange}
      />
    )
    const select = screen.getByLabelText('Filtrar por profesional')
    fireEvent.change(select, { target: { value: '' } })
    expect(onProfessionalChange).toHaveBeenCalledWith(null)
  })

  describe('Story 10.7 — modo de disponibilidad', () => {
    it('NO renderiza el radiogroup si no se pasa onAvailabilityModeChange', () => {
      render(<AgendaFilters {...defaultProps} />)
      expect(screen.queryByRole('radiogroup', { name: /ver disponibilidad de/i })).not.toBeInTheDocument()
    })

    it('renderiza el radiogroup cuando se pasa onAvailabilityModeChange', () => {
      render(
        <AgendaFilters
          {...defaultProps}
          availabilityMode="ninguno"
          onAvailabilityModeChange={vi.fn()}
        />,
      )
      expect(screen.getByRole('radiogroup', { name: /ver disponibilidad de/i })).toBeInTheDocument()
    })

    it('al elegir "Por profesional" limpia el servicio y notifica el modo', () => {
      const onServiceChange = vi.fn()
      const onAvailabilityModeChange = vi.fn()
      render(
        <AgendaFilters
          {...defaultProps}
          serviceId="svc-1"
          availabilityMode="servicio"
          onServiceChange={onServiceChange}
          onAvailabilityModeChange={onAvailabilityModeChange}
        />,
      )
      fireEvent.click(screen.getByRole('radio', { name: /por profesional/i }))
      expect(onServiceChange).toHaveBeenCalledWith(null)
      expect(onAvailabilityModeChange).toHaveBeenCalledWith('profesional')
    })

    it('al elegir "Por servicio" limpia el profesional y notifica el modo', () => {
      const onProfessionalChange = vi.fn()
      const onAvailabilityModeChange = vi.fn()
      render(
        <AgendaFilters
          {...defaultProps}
          professionalId="prof-1"
          availabilityMode="profesional"
          onProfessionalChange={onProfessionalChange}
          onAvailabilityModeChange={onAvailabilityModeChange}
        />,
      )
      fireEvent.click(screen.getByRole('radio', { name: /por servicio/i }))
      expect(onProfessionalChange).toHaveBeenCalledWith(null)
      expect(onAvailabilityModeChange).toHaveBeenCalledWith('servicio')
    })

    it('el radio activo refleja availabilityMode', () => {
      render(
        <AgendaFilters
          {...defaultProps}
          availabilityMode="profesional"
          onAvailabilityModeChange={vi.fn()}
        />,
      )
      expect(screen.getByRole('radio', { name: /por profesional/i })).toHaveAttribute('aria-checked', 'true')
    })
  })
})
