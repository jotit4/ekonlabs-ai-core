import { describe, it, expect } from 'vitest'
import {
  DocumentMetadataSchema,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  formatBytes,
} from './document.schema'

describe('DocumentMetadataSchema', () => {
  it('acepta cada MIME permitido', () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      const result = DocumentMetadataSchema.safeParse({
        file_name: 'doc.bin',
        mime_type: mime,
        size_bytes: 1024,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rechaza un MIME inválido', () => {
    const result = DocumentMetadataSchema.safeParse({
      file_name: 'doc.exe',
      mime_type: 'application/x-msdownload',
      size_bytes: 1024,
    })
    expect(result.success).toBe(false)
  })

  it('rechaza archivos mayores a 15 MB', () => {
    const result = DocumentMetadataSchema.safeParse({
      file_name: 'big.pdf',
      mime_type: 'application/pdf',
      size_bytes: MAX_FILE_SIZE_BYTES + 1,
    })
    expect(result.success).toBe(false)
  })

  it('acepta archivos de exactamente 15 MB', () => {
    const result = DocumentMetadataSchema.safeParse({
      file_name: 'limit.pdf',
      mime_type: 'application/pdf',
      size_bytes: MAX_FILE_SIZE_BYTES,
    })
    expect(result.success).toBe(true)
  })

  it('rechaza archivos vacíos', () => {
    const result = DocumentMetadataSchema.safeParse({
      file_name: 'empty.pdf',
      mime_type: 'application/pdf',
      size_bytes: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rechaza nombre de archivo vacío', () => {
    const result = DocumentMetadataSchema.safeParse({
      file_name: '',
      mime_type: 'image/png',
      size_bytes: 500,
    })
    expect(result.success).toBe(false)
  })
})

describe('formatBytes', () => {
  it('formatea bytes, KB y MB de forma legible', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
  })
})
