import { describe, it, expect } from 'vitest'
import {
  treatmentProgress,
  TREATMENT_STATUS_LABELS,
  type TreatmentStatus,
} from './treatments'

describe('treatmentProgress', () => {
  it('caso del AC: total=10, sessions_remaining=7 → 3 consumidas, 7 restantes', () => {
    const result = treatmentProgress({ total_sessions: 10, sessions_remaining: 7 })
    expect(result).toEqual({ consumidas: 3, restantes: 7, total: 10 })
  })

  it('paquete recién creado (ninguna consumida): total=10, remaining=10 → 0 consumidas', () => {
    expect(treatmentProgress({ total_sessions: 10, sessions_remaining: 10 })).toEqual({
      consumidas: 0,
      restantes: 10,
      total: 10,
    })
  })

  it('paquete completado: total=10, remaining=0 → 10 consumidas, 0 restantes', () => {
    expect(treatmentProgress({ total_sessions: 10, sessions_remaining: 0 })).toEqual({
      consumidas: 10,
      restantes: 0,
      total: 10,
    })
  })

  it('guarda defensiva: remaining > total nunca produce consumidas negativas', () => {
    expect(treatmentProgress({ total_sessions: 5, sessions_remaining: 8 })).toEqual({
      consumidas: 0,
      restantes: 8,
      total: 5,
    })
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
