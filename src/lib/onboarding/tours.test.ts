import { describe, it, expect } from 'vitest'
import { getTourForRoute, ALL_TOURS } from './tours'

describe('getTourForRoute — mapeo rol + ruta → tour', () => {
  // ── Landings por rol ──
  it('receptionist en /recepcion → su landing, arranca con el principio rector', () => {
    const tour = getTourForRoute('receptionist', '/recepcion')
    expect(tour?.id).toBe('receptionist-recepcion')
    expect(tour?.steps[0]?.popover?.title).toMatch(/agente trabaja solo/i)
  })

  it('doctor en /mi-jornada → su landing', () => {
    expect(getTourForRoute('doctor', '/mi-jornada')?.id).toBe('doctor-mi-jornada')
  })

  it('admin en /inicio → su landing', () => {
    expect(getTourForRoute('admin', '/inicio')?.id).toBe('admin-inicio')
  })

  it('cada rol solo ve su propia landing (no la de los otros)', () => {
    expect(getTourForRoute('doctor', '/recepcion')).toBeNull()
    expect(getTourForRoute('receptionist', '/inicio')).toBeNull()
    expect(getTourForRoute('admin', '/mi-jornada')).toBeNull()
  })

  // ── Conversaciones (receptionist + admin) ──
  it('receptionist y admin comparten el tour de la bandeja', () => {
    expect(getTourForRoute('receptionist', '/conversaciones')?.id).toBe('conversaciones')
    expect(getTourForRoute('admin', '/conversaciones')?.id).toBe('conversaciones')
  })

  it('doctor no tiene tour en /conversaciones', () => {
    expect(getTourForRoute('doctor', '/conversaciones')).toBeNull()
  })

  it('el detalle de conversación matchea antes que la lista', () => {
    const tour = getTourForRoute('receptionist', '/conversaciones/%2B5491133334444')
    expect(tour?.id).toBe('conversacion-detalle')
  })

  // ── Agenda ──
  it('receptionist/admin en /agenda → tour de agenda; doctor en /agenda/mi-agenda → su agenda', () => {
    expect(getTourForRoute('receptionist', '/agenda')?.id).toBe('agenda')
    expect(getTourForRoute('admin', '/agenda')?.id).toBe('agenda')
    expect(getTourForRoute('doctor', '/agenda/mi-agenda')?.id).toBe('doctor-mi-agenda')
  })

  // ── Pacientes ──
  it('la lista de pacientes tiene tour para los tres roles', () => {
    expect(getTourForRoute('receptionist', '/pacientes')?.id).toBe('pacientes-lista')
    expect(getTourForRoute('doctor', '/pacientes')?.id).toBe('pacientes-lista')
    expect(getTourForRoute('admin', '/pacientes')?.id).toBe('pacientes-lista')
  })

  it('ficha de paciente: receptionist ve la administrativa, doctor/admin la historia clínica', () => {
    expect(getTourForRoute('receptionist', '/pacientes/abc123')?.id).toBe('paciente-ficha')
    expect(getTourForRoute('doctor', '/pacientes/abc123')?.id).toBe('paciente-hce')
    expect(getTourForRoute('admin', '/pacientes/abc123')?.id).toBe('paciente-hce')
  })

  // ── Doctor ──
  it('doctor en /mi-disponibilidad → su tour de disponibilidad', () => {
    expect(getTourForRoute('doctor', '/mi-disponibilidad')?.id).toBe('doctor-mi-disponibilidad')
  })

  // ── Admin — configuración y métricas ──
  it('admin tiene tours en configuración y métricas', () => {
    expect(getTourForRoute('admin', '/configuracion/agente')?.id).toBe('admin-configuracion-agente')
    expect(getTourForRoute('admin', '/configuracion/usuarios')?.id).toBe('admin-usuarios')
    expect(getTourForRoute('admin', '/configuracion/auditoria')?.id).toBe('admin-auditoria')
    expect(getTourForRoute('admin', '/configuracion/servicios')?.id).toBe('admin-servicios')
    expect(getTourForRoute('admin', '/configuracion/profesionales')?.id).toBe('admin-profesionales')
    expect(getTourForRoute('admin', '/metricas')?.id).toBe('admin-metricas')
  })

  it('configuración/métricas son admin-only', () => {
    expect(getTourForRoute('receptionist', '/configuracion/agente')).toBeNull()
    expect(getTourForRoute('doctor', '/metricas')).toBeNull()
  })

  // ── Bordes ──
  it('rol o pathname null → null', () => {
    expect(getTourForRoute(null, '/conversaciones')).toBeNull()
    expect(getTourForRoute('receptionist', null)).toBeNull()
  })

  it('ruta sin tour → null', () => {
    expect(getTourForRoute('receptionist', '/mi-perfil')).toBeNull()
  })

  // ── Contenido clave ──
  it('el tour de la bandeja explica el semáforo: amarillo = atendé', () => {
    const tour = getTourForRoute('receptionist', '/conversaciones')
    const semaforo = tour?.steps.find((s) => s.element === '[data-tour="conversation-list"]')
    expect(semaforo?.popover?.description).toMatch(/amarillo = atendé/i)
  })

  // ── Anclas estables: data-tour, data-tab, #id o [id="..."] — nunca clases de Tailwind ──
  it('todos los pasos anclados usan selectores estables (data-tour / data-tab / id), nunca clases', () => {
    // data-tab se usa para anclar tours a botones de pestaña (siempre visibles en la TabList),
    // evitando anclar a campos dentro de TabPanels que pueden estar ocultos con display:none.
    const stableSelector =
      /^(\[data-tour="[a-z-]+"\]|\[data-tab="[a-z]+"\]|#[a-zA-Z_-]+|\[id="[a-zA-Z0-9_.-]+"\])$/
    for (const tour of ALL_TOURS) {
      for (const step of tour.steps) {
        if (typeof step.element === 'string') {
          expect(step.element).toMatch(stableSelector)
        }
      }
    }
  })

  it('cada tour declara al menos un rol y un paso', () => {
    for (const tour of ALL_TOURS) {
      expect(tour.roles.length).toBeGreaterThan(0)
      expect(tour.steps.length).toBeGreaterThan(0)
    }
  })

  it('los ids de tour son únicos', () => {
    const ids = ALL_TOURS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // ── Tour del Config del Agente: ancla a pestañas, no a campos internos ──
  it('admin-configuracion-agente: 6 pasos, intro sin element + 4 data-tab + botón guardar', () => {
    const tour = getTourForRoute('admin', '/configuracion/agente')
    expect(tour?.id).toBe('admin-configuracion-agente')
    expect(tour?.steps).toHaveLength(6)
    // Paso 1: intro general, sin element
    expect(tour?.steps[0]?.element).toBeUndefined()
    expect(tour?.steps[0]?.popover?.title).toMatch(/así se comporta/i)
    // Pasos 2-5: anclas a data-tab (botones de pestaña siempre visibles)
    expect(tour?.steps[1]?.element).toBe('[data-tab="personalidad"]')
    expect(tour?.steps[2]?.element).toBe('[data-tab="capacidades"]')
    expect(tour?.steps[3]?.element).toBe('[data-tab="conocimiento"]')
    expect(tour?.steps[4]?.element).toBe('[data-tab="avanzado"]')
    // Paso 6: botón Guardar
    expect(tour?.steps[5]?.element).toBe('[data-tour="agent-save-btn"]')
  })

  it('admin-configuracion-agente: NO contiene anclas a #prompt_rules ni a campos de pestañas ocultas', () => {
    const tour = getTourForRoute('admin', '/configuracion/agente')
    const elements = tour?.steps.map((s) => s.element).filter(Boolean)
    expect(elements).not.toContain('#prompt_rules')
    expect(elements).not.toContain('#kb-content')
    expect(elements).not.toContain('[id="operations_config.future_window_days"]')
    expect(elements).not.toContain('[data-tour="shadow-mode-toggle"]')
  })

  // ── Tour HCE: ancla al botón de la pestaña "notas", no a contenido interno ──
  it('paciente-hce: 2 pasos, sin anclas a elementos dentro de pestañas ocultas', () => {
    const tour = getTourForRoute('doctor', '/pacientes/abc123')
    expect(tour?.id).toBe('paciente-hce')
    expect(tour?.steps).toHaveLength(2)
    // Paso 1: nav de pestañas (siempre en DOM)
    expect(tour?.steps[0]?.element).toBe('[data-tour="patient-tabs"]')
    // Paso 2: botón de pestaña "notas" (siempre visible en el navtablist)
    expect(tour?.steps[1]?.element).toBe('[data-tab="notas"]')
    // No debe haber anclas a elementos dentro de la pestaña inactiva
    const elements = tour?.steps.map((s) => s.element).filter(Boolean)
    expect(elements).not.toContain('[data-tour="hce-contexto-clinico"]')
    expect(elements).not.toContain('[data-tour="hce-nueva-nota"]')
    expect(elements).not.toContain('[data-tour="hce-historial-notas"]')
  })
})
