import { z } from 'zod'

// ─── Constantes de validación de documentos del paciente (Story 11.1) ─────────
// Datos de salud sensibles (Ley 25.326). Validación dura server-side.

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

// Límite de 15 MB
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024

// ─── DocumentMetadataSchema ───────────────────────────────────────────────────
// Metadata derivada del File real en el server (NO confiar en lo que mande el body).
// Zod v4 usa { error: '...' } en lugar de { message: '...' }.

export const DocumentMetadataSchema = z.object({
  file_name: z.string().min(1, { error: 'El nombre del archivo es requerido' }),
  mime_type: z.enum(ALLOWED_MIME_TYPES, {
    error: 'Tipo de archivo no permitido. Solo PDF, JPG, PNG, WEBP o HEIC.',
  }),
  size_bytes: z
    .number()
    .int()
    .positive({ error: 'El archivo está vacío' })
    .max(MAX_FILE_SIZE_BYTES, { error: 'El archivo supera el límite de 15 MB' }),
})

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>

// ─── Helper de formato de tamaño ──────────────────────────────────────────────
// Usado en la UI para mostrar el tamaño legible.

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  const rounded = i === 0 ? value : Math.round(value * 10) / 10
  return `${rounded} ${units[i]}`
}
