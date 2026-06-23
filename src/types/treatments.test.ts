import { describe, it, expect } from 'vitest'
import {
  treatmentProgress,
  TREATMENT_STATUS_LABELS,
  type TreatmentStatus,
} from './treatments'

// Helper: sesiones del paquete con un status dado.
const sess = (statuses: string[]) => statuses.map((status) => ({ status }))

describe('treatmentProgress (contador honesto desde sesiones reales)', () => {
  it('el bug raíz: 2 sesiones, ninguna realizada → 0 realizadas, 2 agendadas (NO "8 consumidas")', () => {
    // Antes: total=10, sessions_remaining=2 (= turnos creados) → "8 consumidas". FALSO.
    // Ahora deriva de las sesiones reales: 0 realizadas, 2 agendadas, faltan 8.
    const result = treatmentProgress({
      total_sessions: 10,
      appointments: sess(['confirmed', 'confirmed']),
    })
    expect(result).toEqual({ realizadas: 0, agendadas: 2, total: 10, por_agendar: 8 })
  })

  it('mezcla de estados: completed cuenta como realizada y agendada; no_show solo agendada', () => {
    const result = treatmentProgress({
      total_sessions: 10,
      appointments: sess(['completed', 'completed', 'confirmed', 'no_show', 'cancelled']),
    })
    // realizadas = 2 (completed); agendadas = 4 (2 completed + 1 confirmed + 1 no_show);
    // cancelled NO cuenta como agendada → faltan 6.
    expect(result).toEqual({ realizadas: 2, agendadas: 4, total: 10, por_agendar: 6 })
  })

  it('paquete recién creado, todas confirmadas → 0 realizadas, N agendadas, 0 por agendar', () => {
    expect(
      treatmentProgress({
        total_sessions: 3,
        appointments: sess(['confirmed', 'confirmed', 'confirmed']),
      }),
    ).toEqual({ realizadas: 0, agendadas: 3, total: 3, por_agendar: 0 })
  })

  it('paquete completado: todas completed → N realizadas, N agendadas, 0 por agendar', () => {
    expect(
      treatmentProgress({
        total_sessions: 3,
        appointments: sess(['completed', 'completed', 'completed']),
      }),
    ).toEqual({ realizadas: 3, agendadas: 3, total: 3, por_agendar: 0 })
  })

  it('sin appointments → 0 realizadas, 0 agendadas, todas por agendar', () => {
    expect(treatmentProgress({ total_sessions: 10, appointments: [] })).toEqual({
      realizadas: 0,
      agendadas: 0,
      total: 10,
      por_agendar: 10,
    })
    // null también es seguro
    expect(treatmentProgress({ total_sessions: 10, appointments: null })).toEqual({
      realizadas: 0,
      agendadas: 0,
      total: 10,
      por_agendar: 10,
    })
  })

  it('guarda defensiva: más agendadas que el total nunca produce negativos', () => {
    const result = treatmentProgress({
      total_sessions: 2,
      appointments: sess(['confirmed', 'confirmed', 'confirmed']),
    })
    expect(result.agendadas).toBe(2) // tope = total
    expect(result.por_agendar).toBe(0)
    expect(result.realizadas).toBeGreaterThanOrEqual(0)
  })
})

describe('TREATMENT_STATUS_LABELS', () => {
  it('cubre los 4 estados con labels en español', () => {
    const statuses: TreatmentStatus[] = ['active', 'completed', 'cancelled', 'expired']
    for (const s of statuses) {
      expect(TREATMENT_STATUS_LABELS[s]).toBeTruthy()
    }
    expect(TREATMENT_STATUS_LABELS.active).toBe('Activo')
    expect(TREATMENT_STATUS_LABELS.expired).toBe('Vencido')
  })
})
