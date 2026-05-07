import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logAudit } from './audit'

const mockInsert = vi.fn()
const mockSupabase = { from: vi.fn(() => ({ insert: mockInsert })) } as unknown as SupabaseClient

describe('logAudit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invoca from("audit_logs") e insert con los parámetros correctos', async () => {
    mockInsert.mockResolvedValueOnce({ error: null })

    await logAudit({
      action: 'patient_accessed',
      entity_type: 'patient',
      entity_id: 'patient-123',
      supabase: mockSupabase,
    })

    expect(mockSupabase.from).toHaveBeenCalledWith('audit_logs')
    expect(mockInsert).toHaveBeenCalledWith({
      action: 'patient_accessed',
      entity_type: 'patient',
      entity_id: 'patient-123',
      ip_address: null,
    })
  })

  it('no lanza cuando insert retorna error', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'DB error' } })

    await expect(
      logAudit({
        action: 'patient_accessed',
        entity_type: 'patient',
        entity_id: 'x',
        supabase: mockSupabase,
      }),
    ).resolves.not.toThrow()
  })

  it('no lanza cuando insert lanza excepción', async () => {
    mockInsert.mockRejectedValueOnce(new Error('Network error'))

    await expect(
      logAudit({
        action: 'patient_accessed',
        entity_type: 'patient',
        entity_id: 'x',
        supabase: mockSupabase,
      }),
    ).resolves.not.toThrow()
  })

  it('incluye ip_address cuando se provee', async () => {
    mockInsert.mockResolvedValueOnce({ error: null })

    await logAudit({
      action: 'patient_data_updated',
      entity_type: 'patient',
      entity_id: 'p-456',
      supabase: mockSupabase,
      ip_address: '192.168.1.1',
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: '192.168.1.1' }),
    )
  })
})
