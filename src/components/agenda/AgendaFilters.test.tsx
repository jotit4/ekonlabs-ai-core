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
        { service_id: 'svc-1', name: 'Kinesiología', reception_group: 'fisioterapia' },
        { service_id: 'svc-2', name: 'Pediatría', reception_group: null },
        { service_id: 'svc-3', name: 'Aquagym', reception_group: 'pileta' },
        { service_id: 'svc-4', name: 'Pilates', reception_group: 'pilates' },
      ],
    },
  }),
}))

import { AgendaFilters, AgendaServiceButtons } from './AgendaFilters'

const defaultProps = {
  professionalId: null,
  serviceId: null,
  onProfessionalChange: vi.fn(),
  onClear: vi.fn(),
  showFilters: true,
}

describe('AgendaFilters (Profesional + Área + Limpiar)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza el selector de profesional y "Limpiar" cuando showFilters=true', () => {
    render(<AgendaFilters {...defaultProps} />)
    expect(screen.getByLabelText('Filtrar por profesional')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /limpiar/i })).toBeInTheDocument()
  })

  it('NO renderiza nada cuando showFilters=false', () => {
    render(<AgendaFilters {...defaultProps} showFilters={false} />)
    expect(screen.queryByLabelText('Filtrar por profesional')).not.toBeInTheDocument()
  })

  // El <select> de Servicio se retiró de este componente (pedido ISADI
  // 2026-07-14: reemplazado por botones toggle en <AgendaServiceButtons>,
  // siempre visible). AgendaFilters solo conserva `serviceId` para el estado
  // de "Limpiar" — no renderiza ningún control de servicio.
  it('NO renderiza un <select> de servicio (movido a AgendaServiceButtons)', () => {
    render(<AgendaFilters {...defaultProps} />)
    expect(screen.queryByLabelText('Filtrar por servicio')).not.toBeInTheDocument()
  })

  it('llama onProfessionalChange al cambiar el selector de profesional', () => {
    const onProfessionalChange = vi.fn()
    render(<AgendaFilters {...defaultProps} onProfessionalChange={onProfessionalChange} />)
    const select = screen.getByLabelText('Filtrar por profesional')
    fireEvent.change(select, { target: { value: 'prof-1' } })
    expect(onProfessionalChange).toHaveBeenCalledWith('prof-1')
  })

  it('botón "Limpiar" está deshabilitado cuando ambos filtros son null', () => {
    render(<AgendaFilters {...defaultProps} professionalId={null} serviceId={null} />)
    expect(screen.getByRole('button', { name: /limpiar/i })).toBeDisabled()
  })

  it('botón "Limpiar" está habilitado cuando hay al menos un filtro activo (profesional)', () => {
    render(<AgendaFilters {...defaultProps} professionalId="prof-1" serviceId={null} />)
    expect(screen.getByRole('button', { name: /limpiar/i })).not.toBeDisabled()
  })

  it('botón "Limpiar" está habilitado cuando hay un service_id activo (aunque el control viva afuera)', () => {
    render(<AgendaFilters {...defaultProps} professionalId={null} serviceId="svc-1" />)
    expect(screen.getByRole('button', { name: /limpiar/i })).not.toBeDisabled()
  })

  // Deuda detectada Frente B — el grupo de recepción (Fisioterapia/Pileta/
  // Pilates) es un estado de AgendaView que antes NO se le pasaba a este
  // componente: "Limpiar" quedaba deshabilitado cuando el ÚNICO filtro activo
  // era el grupo, obligando a deseleccionarlo tocando de nuevo el botón de
  // grupo en vez de poder usar "Limpiar".
  it('botón "Limpiar" está habilitado cuando SOLO hay un grupo de recepción activo (sin service_id ni professional_id)', () => {
    render(
      <AgendaFilters
        {...defaultProps}
        professionalId={null}
        serviceId={null}
        hasReceptionGroup
      />,
    )
    expect(screen.getByRole('button', { name: /limpiar/i })).not.toBeDisabled()
  })

  it('botón "Limpiar" sigue deshabilitado cuando no hay ningún filtro (ni grupo de recepción)', () => {
    render(
      <AgendaFilters
        {...defaultProps}
        professionalId={null}
        serviceId={null}
        hasReceptionGroup={false}
      />,
    )
    expect(screen.getByRole('button', { name: /limpiar/i })).toBeDisabled()
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

  // El toggle "Área: Rehabilitación | Ver todo" se retiró (decisión ISADI dueño
  // 2026-07-16 — la agenda es 100% modo grupos para todos los roles). El foco
  // por defecto a rehabilitación se mantiene en AgendaView (const fija), pero ya
  // no hay ningún control de UI para cambiarlo.
  describe('Toggle de área "Rehabilitación | Ver todo" eliminado', () => {
    it('NO renderiza el radiogroup de área ni sus radios', () => {
      render(<AgendaFilters {...defaultProps} />)
      expect(screen.queryByRole('radiogroup', { name: /área de la agenda/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: /rehabilitación/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: /ver todo/i })).not.toBeInTheDocument()
    })
  })
})

// ─── AgendaServiceButtons — 3 botones de GRUPO (decisión ISADI 2026-07-16) ────
// La agenda se filtra por 3 botones de GRUPO (Fisioterapia/Pileta/Pilates) —
// uno por cada `reception_group` no nulo presente en el catálogo. Es el ÚNICO
// modo para TODOS los roles (admin y recepción): "igual que recepción". Ya no
// existe el botón por servicio individual ni las props
// `serviceId`/`onServiceChange`/`areaFocus`/`isReceptionist`.
describe('AgendaServiceButtons (botones de grupo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const groupProps = {
    receptionGroup: null,
    onReceptionGroupChange: vi.fn(),
  }

  it('renderiza un botón por cada reception_group presente (Fisioterapia/Pileta/Pilates)', () => {
    render(<AgendaServiceButtons {...groupProps} />)
    expect(screen.getByRole('button', { name: /^fisioterapia$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^pileta$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pilates/i })).toBeInTheDocument()
  })

  it('NO renderiza botones por servicio individual (Kinesiología/Aquagym/Pediatría)', () => {
    render(<AgendaServiceButtons {...groupProps} />)
    // Kinesiología/Aquagym pertenecen a grupos → no se ven sueltas.
    expect(screen.queryByRole('button', { name: 'Kinesiología' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aquagym' })).not.toBeInTheDocument()
    // Pediatría (reception_group null) tampoco genera ningún botón.
    expect(screen.queryByRole('button', { name: /pediatría/i })).not.toBeInTheDocument()
  })

  it('el botón de Pilates dice solo "Pilates" (sin hint de cupos)', () => {
    render(<AgendaServiceButtons {...groupProps} />)
    expect(screen.getByRole('button', { name: 'Pilates' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lugares\/hora/i })).not.toBeInTheDocument()
  })

  it('el contenedor tiene role="group" con aria-label "Filtrar por grupo"', () => {
    render(<AgendaServiceButtons {...groupProps} />)
    expect(screen.getByRole('group', { name: /filtrar por grupo/i })).toBeInTheDocument()
  })

  it('el botón min-height cumple el mínimo táctil de 44px', () => {
    render(<AgendaServiceButtons {...groupProps} />)
    expect(screen.getByRole('button', { name: /^fisioterapia$/i }).className).toContain('min-h-[44px]')
  })

  it('un grupo sin seleccionar tiene aria-pressed="false"', () => {
    render(<AgendaServiceButtons {...groupProps} />)
    expect(screen.getByRole('button', { name: /^fisioterapia$/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('click en un grupo no seleccionado llama onReceptionGroupChange con su value', () => {
    const onReceptionGroupChange = vi.fn()
    render(<AgendaServiceButtons {...groupProps} onReceptionGroupChange={onReceptionGroupChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^fisioterapia$/i }))
    expect(onReceptionGroupChange).toHaveBeenCalledWith('fisioterapia')
  })

  it('el grupo activo tiene aria-pressed="true"', () => {
    render(<AgendaServiceButtons {...groupProps} receptionGroup="fisioterapia" />)
    expect(screen.getByRole('button', { name: /^fisioterapia$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('click en el grupo YA activo lo deselecciona (llama onReceptionGroupChange con null)', () => {
    const onReceptionGroupChange = vi.fn()
    render(
      <AgendaServiceButtons
        {...groupProps}
        receptionGroup="fisioterapia"
        onReceptionGroupChange={onReceptionGroupChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^fisioterapia$/i }))
    expect(onReceptionGroupChange).toHaveBeenCalledWith(null)
  })

  it('click en un grupo distinto al activo cambia la selección (no la limpia)', () => {
    const onReceptionGroupChange = vi.fn()
    render(
      <AgendaServiceButtons
        {...groupProps}
        receptionGroup="fisioterapia"
        onReceptionGroupChange={onReceptionGroupChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^pileta$/i }))
    expect(onReceptionGroupChange).toHaveBeenCalledWith('pileta')
  })
})
