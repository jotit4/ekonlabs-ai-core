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

// Grupos de recepción (tenants.rules.reception_groups, migración 069) — dato
// de la cuenta leído vía useTenantConfig, ya NO un array fijo en el código.
// Mock configurable por test (default: mismas etiquetas que ISADI hoy).
// agendaAreaFocus/agendaAreaFocusLabel (migración 075) viven en el mismo
// objeto — default: cuenta SIN foco (agendaAreaFocus: null), como la
// mayoría de los tests de este archivo no le atañe.
const mockReceptionGroups = vi.hoisted(() => ({
  current: {
    fisioterapia: { label: 'Fisioterapia', main_service_id: null },
    pileta: { label: 'Pileta', main_service_id: null },
    pilates: { label: 'Pilates', main_service_id: null },
  } as Record<string, { label: string; main_service_id: string | null; order?: number }>,
  isPending: false,
  agendaAreaFocus: null as 'rehab' | null,
  agendaAreaFocusLabel: 'Rehabilitación',
}))
vi.mock('@/hooks/use-tenant-config', () => ({
  useTenantConfig: () => ({
    receptionGroups: mockReceptionGroups.current,
    isPending: mockReceptionGroups.isPending,
    agendaAreaFocus: mockReceptionGroups.agendaAreaFocus,
    agendaAreaFocusLabel: mockReceptionGroups.agendaAreaFocusLabel,
  }),
}))

import { AgendaFilters, AgendaServiceButtons, AgendaFocusSelector } from './AgendaFilters'

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

// ─── AgendaServiceButtons — botones de GRUPO (decisión ISADI 2026-07-16) ─────
// La agenda se filtra por botones de GRUPO — uno por cada `reception_group`
// no nulo presente en el catálogo. Es el ÚNICO modo para TODOS los roles
// (admin y recepción): "igual que recepción". Ya no existe el botón por
// servicio individual ni las props `serviceId`/`onServiceChange`/`areaFocus`/
// `isReceptionist`. La etiqueta de cada grupo ya NO es un array fijo en el
// código (antes solo conocía fisioterapia/pileta/pilates) — sale de
// `tenants.rules.reception_groups` (useTenantConfig) o, si la cuenta no la
// configuró, de la clave capitalizada.
describe('AgendaServiceButtons (botones de grupo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReceptionGroups.isPending = false
    mockReceptionGroups.current = {
      fisioterapia: { label: 'Fisioterapia', main_service_id: null },
      pileta: { label: 'Pileta', main_service_id: null },
      pilates: { label: 'Pilates', main_service_id: null },
    }
  })

  const groupProps = {
    receptionGroup: null,
    onReceptionGroupChange: vi.fn(),
  }

  it('el orden de los botones sale de `order` de la cuenta, no del orden de aparición de los servicios', () => {
    mockReceptionGroups.current = {
      fisioterapia: { label: 'Fisioterapia', main_service_id: null, order: 3 },
      pileta: { label: 'Pileta', main_service_id: null, order: 1 },
      pilates: { label: 'Pilates', main_service_id: null, order: 2 },
    }
    render(<AgendaServiceButtons {...groupProps} />)
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.textContent?.trim())
      .filter((t) => t === 'Fisioterapia' || t === 'Pileta' || t === 'Pilates')
    expect(labels).toEqual(['Pileta', 'Pilates', 'Fisioterapia'])
  })

  it('mientras la config de la cuenta carga NO pinta botones (evita mostrarlos en otro orden y reacomodarlos)', () => {
    mockReceptionGroups.isPending = true
    mockReceptionGroups.current = {}
    const { container } = render(<AgendaServiceButtons {...groupProps} />)
    expect(container).toBeEmptyDOMElement()
  })

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

  // ── Etiqueta = dato de la cuenta (tenants.rules.reception_groups) ──────────
  describe('etiqueta configurable por cuenta', () => {
    it('usa la etiqueta configurada en reception_groups en vez de un nombre fijo', () => {
      mockReceptionGroups.current = {
        fisioterapia: { label: 'Kinesiología', main_service_id: null },
        pileta: { label: 'Pileta', main_service_id: null },
        pilates: { label: 'Pilates', main_service_id: null },
      }
      render(<AgendaServiceButtons {...groupProps} />)
      expect(screen.getByRole('button', { name: /^kinesiología$/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^fisioterapia$/i })).not.toBeInTheDocument()
    })

    it('cae a la clave capitalizada cuando la cuenta no configuró reception_groups (cuenta demo)', () => {
      mockReceptionGroups.current = {}
      render(<AgendaServiceButtons {...groupProps} />)
      // Fallback: mismo texto que hoy para ISADI (capitalizar('fisioterapia')
      // = 'Fisioterapia'), pero derivado de la clave, no de un array fijo.
      expect(screen.getByRole('button', { name: /^fisioterapia$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^pileta$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^pilates$/i })).toBeInTheDocument()
    })
  })
})

// ─── AgendaFocusSelector — selector "Ver" (foco de área configurable, paso 2/3) ─
// Pedido del dueño sobre agenda_area_focus (migración 062): un selector
// persistente al lado de los botones de grupo que permita cambiar el
// comportamiento por defecto de la cuenta. Solo aparece si la cuenta tiene
// agenda_area_focus configurado.
describe('AgendaFocusSelector (selector "Ver")', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReceptionGroups.isPending = false
    mockReceptionGroups.agendaAreaFocus = null
    mockReceptionGroups.agendaAreaFocusLabel = 'Rehabilitación'
  })

  const selectorProps = { value: 'foco' as const, onChange: vi.fn() }

  it('NO se pinta cuando la cuenta no tiene agenda_area_focus (cuenta demo)', () => {
    mockReceptionGroups.agendaAreaFocus = null
    const { container } = render(<AgendaFocusSelector {...selectorProps} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('NO se pinta mientras la config de la cuenta está pendiente', () => {
    mockReceptionGroups.agendaAreaFocus = 'rehab'
    mockReceptionGroups.isPending = true
    const { container } = render(<AgendaFocusSelector {...selectorProps} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('se pinta cuando la cuenta tiene agenda_area_focus="rehab" (ISADI)', () => {
    mockReceptionGroups.agendaAreaFocus = 'rehab'
    render(<AgendaFocusSelector {...selectorProps} />)
    expect(screen.getByLabelText('Ver')).toBeInTheDocument()
  })

  it('la opción de foco usa la etiqueta configurada por la cuenta, no un nombre fijo', () => {
    mockReceptionGroups.agendaAreaFocus = 'rehab'
    mockReceptionGroups.agendaAreaFocusLabel = 'Kinesiología'
    render(<AgendaFocusSelector {...selectorProps} />)
    expect(screen.getByRole('option', { name: 'Kinesiología' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Rehabilitación' })).not.toBeInTheDocument()
  })

  it('ofrece "Todos los servicios" como segunda opción', () => {
    mockReceptionGroups.agendaAreaFocus = 'rehab'
    render(<AgendaFocusSelector {...selectorProps} />)
    expect(screen.getByRole('option', { name: 'Todos los servicios' })).toBeInTheDocument()
  })

  it('refleja el value recibido por props', () => {
    mockReceptionGroups.agendaAreaFocus = 'rehab'
    render(<AgendaFocusSelector value="todos" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Ver')).toHaveValue('todos')
  })

  it('llama onChange con "todos" al elegir esa opción', () => {
    mockReceptionGroups.agendaAreaFocus = 'rehab'
    const onChange = vi.fn()
    render(<AgendaFocusSelector value="foco" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Ver'), { target: { value: 'todos' } })
    expect(onChange).toHaveBeenCalledWith('todos')
  })

  it('llama onChange con "foco" al volver a elegir esa opción', () => {
    mockReceptionGroups.agendaAreaFocus = 'rehab'
    const onChange = vi.fn()
    render(<AgendaFocusSelector value="todos" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Ver'), { target: { value: 'foco' } })
    expect(onChange).toHaveBeenCalledWith('foco')
  })

  it('cumple el mínimo táctil de 44px', () => {
    mockReceptionGroups.agendaAreaFocus = 'rehab'
    render(<AgendaFocusSelector {...selectorProps} />)
    expect(screen.getByLabelText('Ver').className).toContain('min-h-[44px]')
  })
})
