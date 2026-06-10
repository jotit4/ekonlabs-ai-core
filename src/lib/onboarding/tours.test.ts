import { describe, it, expect } from 'vitest'
import { getTourForRoute } from './tours'

describe('getTourForRoute — mapeo rol + ruta → tour', () => {
  it('receptionist en /conversaciones → tour de la bandeja', () => {
    const tour = getTourForRoute('receptionist', '/conversaciones')
    expect(tour?.id).toBe('receptionist-conversaciones')
    expect(tour?.steps.length).toBeGreaterThan(0)
  })

  it('receptionist en /conversaciones/[id] → tour del detalle (no el de la lista)', () => {
    const tour = getTourForRoute('receptionist', '/conversaciones/%2B5491133334444')
    expect(tour?.id).toBe('receptionist-conversacion-detalle')
  })

  it('receptionist en /agenda → tour de agenda', () => {
    expect(getTourForRoute('receptionist', '/agenda')?.id).toBe('receptionist-agenda')
    expect(getTourForRoute('receptionist', '/agenda/mi-agenda')?.id).toBe('receptionist-agenda')
  })

  it('receptionist en ruta sin tour → null', () => {
    expect(getTourForRoute('receptionist', '/pacientes')).toBeNull()
  })

  it('doctor y admin → sin tours todavía (null)', () => {
    expect(getTourForRoute('doctor', '/agenda/mi-agenda')).toBeNull()
    expect(getTourForRoute('admin', '/conversaciones')).toBeNull()
  })

  it('rol o pathname null → null', () => {
    expect(getTourForRoute(null, '/conversaciones')).toBeNull()
    expect(getTourForRoute('receptionist', null)).toBeNull()
  })

  it('el primer paso del tour de la bandeja es el principio rector (agente trabaja solo)', () => {
    const tour = getTourForRoute('receptionist', '/conversaciones')
    expect(tour?.steps[0]?.popover?.title).toMatch(/agente trabaja solo/i)
  })

  it('el tour de la bandeja explica el semáforo: amarillo = atendé', () => {
    const tour = getTourForRoute('receptionist', '/conversaciones')
    const semaforo = tour?.steps.find((s) => s.element === '[data-tour="conversation-list"]')
    expect(semaforo?.popover?.description).toMatch(/amarillo = atendé/i)
  })

  it('los pasos anclados usan selectores data-tour (nunca clases de Tailwind)', () => {
    for (const pathname of ['/conversaciones', '/conversaciones/x', '/agenda']) {
      const tour = getTourForRoute('receptionist', pathname)
      for (const step of tour?.steps ?? []) {
        if (typeof step.element === 'string') {
          expect(step.element).toMatch(/^\[data-tour="[a-z-]+"\]$/)
        }
      }
    }
  })
})
