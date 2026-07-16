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

// ─── AgendaServiceButtons (pedido ISADI 2026-07-14) ───────────────────────────
// Reemplaza el <select> de Servicio por una fila de botones toggle, siempre
// visible (no gated detrás de "Filtrar" como el resto de los controles).
describe('AgendaServiceButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const buttonProps = {
    serviceId: null,
    onServiceChange: vi.fn(),
  }

  it('renderiza un botón por cada servicio (foco por defecto = rehab)', () => {
    render(<AgendaServiceButtons {...buttonProps} />)
    expect(screen.getByRole('button', { name: 'Kinesiología' })).toBeInTheDocument()
    // Pediatría no es un servicio de rehab → no aparece con el foco default.
    expect(screen.queryByRole('button', { name: 'Pediatría' })).not.toBeInTheDocument()
  })

  it('con areaFocus="todos" lista todos los servicios', () => {
    render(<AgendaServiceButtons {...buttonProps} areaFocus="todos" />)
    expect(screen.getByRole('button', { name: 'Kinesiología' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pediatría' })).toBeInTheDocument()
  })

  it('el botón min-height cumple el mínimo táctil de 44px', () => {
    render(<AgendaServiceButtons {...buttonProps} areaFocus="todos" />)
    expect(screen.getByRole('button', { name: 'Kinesiología' }).className).toContain('min-h-[44px]')
  })

  it('el contenedor tiene role="group" con aria-label "Filtrar por servicio"', () => {
    render(<AgendaServiceButtons {...buttonProps} areaFocus="todos" />)
    expect(screen.getByRole('group', { name: /filtrar por servicio/i })).toBeInTheDocument()
  })

  it('un servicio sin seleccionar tiene aria-pressed="false"', () => {
    render(<AgendaServiceButtons {...buttonProps} areaFocus="todos" />)
    expect(screen.getByRole('button', { name: 'Kinesiología' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('click en un servicio no seleccionado llama onServiceChange con su id', () => {
    const onServiceChange = vi.fn()
    render(<AgendaServiceButtons {...buttonProps} areaFocus="todos" onServiceChange={onServiceChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kinesiología' }))
    expect(onServiceChange).toHaveBeenCalledWith('svc-1')
  })

  it('el servicio activo tiene aria-pressed="true"', () => {
    render(<AgendaServiceButtons {...buttonProps} areaFocus="todos" serviceId="svc-1" />)
    expect(screen.getByRole('button', { name: 'Kinesiología' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('click en el servicio YA activo lo deselecciona (llama onServiceChange con null)', () => {
    const onServiceChange = vi.fn()
    render(
      <AgendaServiceButtons
        {...buttonProps}
        areaFocus="todos"
        serviceId="svc-1"
        onServiceChange={onServiceChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Kinesiología' }))
    expect(onServiceChange).toHaveBeenCalledWith(null)
  })

  it('click en un servicio distinto al activo cambia la selección (no la limpia)', () => {
    const onServiceChange = vi.fn()
    render(
      <AgendaServiceButtons
        {...buttonProps}
        areaFocus="todos"
        serviceId="svc-1"
        onServiceChange={onServiceChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pediatría' }))
    expect(onServiceChange).toHaveBeenCalledWith('svc-2')
  })
})

// ─── Botones de GRUPO para recepción (Pedido 2 ISADI 2026-07-16) ─────────────
// isReceptionist=true reemplaza los botones por servicio por 3 botones de
// GRUPO (Fisioterapia/Pileta/Pilates) — uno por cada `reception_group` no
// nulo presente en el catálogo.
describe('AgendaServiceButtons — modo recepción (isReceptionist)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const receptionProps = {
    serviceId: null,
    onServiceChange: vi.fn(),
    isReceptionist: true,
    receptionGroup: null,
    onReceptionGroupChange: vi.fn(),
  }

  it('renderiza un botón por cada reception_group presente (Fisioterapia/Pileta/Pilates)', () => {
    render(<AgendaServiceButtons {...receptionProps} />)
    expect(screen.getByRole('button', { name: /^fisioterapia$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^pileta$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pilates/i })).toBeInTheDocument()
    // NO aparece un botón por servicio individual (Kinesiología es del grupo
    // Fisioterapia, no debe verse suelta).
    expect(screen.queryByRole('button', { name: 'Kinesiología' })).not.toBeInTheDocument()
    // Pediatría (reception_group null) tampoco genera ningún botón.
    expect(screen.queryByRole('button', { name: /pediatría/i })).not.toBeInTheDocument()
  })

  it('el botón de Pilates dice solo "Pilates" (sin hint de cupos)', () => {
    render(<AgendaServiceButtons {...receptionProps} />)
    expect(screen.getByRole('button', { name: 'Pilates' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lugares\/hora/i })).not.toBeInTheDocument()
  })

  it('el contenedor tiene role="group" con aria-label "Filtrar por grupo"', () => {
    render(<AgendaServiceButtons {...receptionProps} />)
    expect(screen.getByRole('group', { name: /filtrar por grupo/i })).toBeInTheDocument()
  })

  it('click en un grupo no seleccionado llama onReceptionGroupChange con su value', () => {
    const onReceptionGroupChange = vi.fn()
    render(<AgendaServiceButtons {...receptionProps} onReceptionGroupChange={onReceptionGroupChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^fisioterapia$/i }))
    expect(onReceptionGroupChange).toHaveBeenCalledWith('fisioterapia')
  })

  it('el grupo activo tiene aria-pressed="true"; click de nuevo lo deselecciona (null)', () => {
    const onReceptionGroupChange = vi.fn()
    render(
      <AgendaServiceButtons
        {...receptionProps}
        receptionGroup="fisioterapia"
        onReceptionGroupChange={onReceptionGroupChange}
      />,
    )
    const btn = screen.getByRole('button', { name: /^fisioterapia$/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn)
    expect(onReceptionGroupChange).toHaveBeenCalledWith(null)
  })

  it('no llama a onServiceChange (los botones de grupo no tocan el service_id real)', () => {
    const onServiceChange = vi.fn()
    render(<AgendaServiceButtons {...receptionProps} onServiceChange={onServiceChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^pileta$/i }))
    expect(onServiceChange).not.toHaveBeenCalled()
  })
})
