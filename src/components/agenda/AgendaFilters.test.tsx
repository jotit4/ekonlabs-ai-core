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

  describe('Radiogroup "Ver disponibilidad de" eliminado', () => {
    // El control era redundante con los dropdowns Profesional/Servicio. La
    // exclusión mutua se preservó en los onChange de los dropdowns (probada a
    // nivel AgendaView). Aquí solo verificamos que el radiogroup ya no existe.
    it('NO renderiza el radiogroup "Ver disponibilidad de"', () => {
      render(<AgendaFilters {...defaultProps} />)
      expect(
        screen.queryByRole('radiogroup', { name: /ver disponibilidad de/i }),
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: /por profesional/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: /por servicio/i })).not.toBeInTheDocument()
    })

    it('el dropdown de profesional sigue notificando onProfessionalChange', () => {
      const onProfessionalChange = vi.fn()
      render(<AgendaFilters {...defaultProps} onProfessionalChange={onProfessionalChange} />)
      fireEvent.change(screen.getByLabelText('Filtrar por profesional'), {
        target: { value: 'prof-1' },
      })
      expect(onProfessionalChange).toHaveBeenCalledWith('prof-1')
    })
  })

  describe('Foco de área (rehabilitación)', () => {
    it('NO renderiza el control de área si no se pasa onAreaFocusChange', () => {
      render(<AgendaFilters {...defaultProps} />)
      expect(screen.queryByRole('radiogroup', { name: /área de la agenda/i })).not.toBeInTheDocument()
    })

    it('renderiza el control "Rehabilitación | Ver todo" cuando se pasa onAreaFocusChange', () => {
      render(<AgendaFilters {...defaultProps} areaFocus="rehab" onAreaFocusChange={vi.fn()} />)
      expect(screen.getByRole('radiogroup', { name: /área de la agenda/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /rehabilitación/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /ver todo/i })).toBeInTheDocument()
    })

    it('con areaFocus="rehab" el dropdown de servicio solo lista servicios de rehab', () => {
      // El mock de useList devuelve Kinesiología (rehab) + Pediatría (no rehab).
      render(<AgendaFilters {...defaultProps} areaFocus="rehab" onAreaFocusChange={vi.fn()} />)
      const select = screen.getByLabelText('Filtrar por servicio')
      expect(select).toHaveTextContent('Kinesiología')
      expect(select).not.toHaveTextContent('Pediatría')
    })

    it('con areaFocus="todos" el dropdown lista todos los servicios', () => {
      render(<AgendaFilters {...defaultProps} areaFocus="todos" onAreaFocusChange={vi.fn()} />)
      const select = screen.getByLabelText('Filtrar por servicio')
      expect(select).toHaveTextContent('Kinesiología')
      expect(select).toHaveTextContent('Pediatría')
    })

    it('default (sin areaFocus) recorta a rehab', () => {
      render(<AgendaFilters {...defaultProps} onAreaFocusChange={vi.fn()} />)
      const select = screen.getByLabelText('Filtrar por servicio')
      expect(select).not.toHaveTextContent('Pediatría')
    })

    it('click en "Ver todo" notifica onAreaFocusChange("todos")', () => {
      const onAreaFocusChange = vi.fn()
      render(<AgendaFilters {...defaultProps} areaFocus="rehab" onAreaFocusChange={onAreaFocusChange} />)
      fireEvent.click(screen.getByRole('radio', { name: /ver todo/i }))
      expect(onAreaFocusChange).toHaveBeenCalledWith('todos')
    })

    it('el radio activo refleja areaFocus', () => {
      render(<AgendaFilters {...defaultProps} areaFocus="todos" onAreaFocusChange={vi.fn()} />)
      expect(screen.getByRole('radio', { name: /ver todo/i })).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByRole('radio', { name: /rehabilitación/i })).toHaveAttribute('aria-checked', 'false')
    })
  })
})
