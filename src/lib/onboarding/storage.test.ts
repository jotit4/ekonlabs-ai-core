import { describe, it, expect, beforeEach } from 'vitest'
import { hasSeenTour, markTourSeen } from './storage'

describe('onboarding storage — persistencia de "tour visto"', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('tour nunca visto → hasSeenTour false', () => {
    expect(hasSeenTour('receptionist-conversaciones')).toBe(false)
  })

  it('markTourSeen → hasSeenTour true', () => {
    markTourSeen('receptionist-conversaciones')
    expect(hasSeenTour('receptionist-conversaciones')).toBe(true)
  })

  it('los flags son por tour id — marcar uno no afecta a otro', () => {
    markTourSeen('receptionist-conversaciones')
    expect(hasSeenTour('receptionist-agenda')).toBe(false)
  })

  it('usa el prefijo ekonlabs:tour-seen: en localStorage', () => {
    markTourSeen('receptionist-agenda')
    expect(window.localStorage.getItem('ekonlabs:tour-seen:receptionist-agenda')).toBe('1')
  })
})
