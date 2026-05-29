'use client'

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatBytes } from '@/lib/schemas/document.schema'
import type { PatientDocument } from '@/types/patients'

interface PatientDocumentsProps {
  patientId: string
  /** Si la ficha es solo-lectura (eliminación pendiente), se oculta la subida. */
  readOnly?: boolean
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic'

function SourceBadge({ source }: { source: PatientDocument['source'] }) {
  const isWhatsApp = source === 'whatsapp'
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 999,
        backgroundColor: isWhatsApp ? '#e7f7ed' : '#eef2ff',
        color: isWhatsApp ? '#1a7f4b' : '#3a3fb3',
      }}
    >
      {isWhatsApp ? 'WhatsApp' : 'Manual'}
    </span>
  )
}

export function PatientDocuments({ patientId, readOnly = false }: PatientDocumentsProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const { data, isPending, isError } = useQuery<{ documents: PatientDocument[] }>({
    queryKey: ['patients', 'documents', patientId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/documents`)
      if (!res.ok) throw new Error('Error fetching documents')
      return res.json() as Promise<{ documents: PatientDocument[] }>
    },
    staleTime: 0,
  })

  async function uploadFile(file: File) {
    setUploadError(null)
    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/patients/${patientId}/documents`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'No se pudo subir el documento')
      }
      await queryClient.invalidateQueries({ queryKey: ['patients', 'documents', patientId] })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo subir el documento')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void uploadFile(file)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    if (readOnly || isUploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) void uploadFile(file)
  }

  async function handleDownload(doc: PatientDocument) {
    setDownloadingId(doc.document_id)
    try {
      const res = await fetch(
        `/api/patients/${patientId}/documents/${doc.document_id}/download`
      )
      if (!res.ok) throw new Error('No se pudo generar el enlace')
      const body = (await res.json()) as { url: string }
      window.open(body.url, '_blank', 'noopener,noreferrer')
    } catch {
      setUploadError('No se pudo descargar el documento. Intentá de nuevo.')
    } finally {
      setDownloadingId(null)
    }
  }

  const documents = data?.documents ?? []

  return (
    <section aria-label="Documentos del paciente">
      {/* Zona de subida — oculta si la ficha es solo-lectura */}
      {!readOnly && (
        <div style={{ marginBottom: 24 }}>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (!isUploading) setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            aria-label="Subir documento"
            style={{
              border: `2px dashed ${isDragging ? 'var(--color-interactive, #0071e3)' : 'rgba(0,0,0,0.15)'}`,
              borderRadius: 10,
              padding: '28px 16px',
              textAlign: 'center',
              cursor: isUploading ? 'default' : 'pointer',
              backgroundColor: isDragging ? 'rgba(0,113,227,0.04)' : 'transparent',
              transition: 'border-color 0.15s, background-color 0.15s',
            }}
          >
            <p style={{ fontSize: 15, marginBottom: 4 }}>
              {isUploading ? 'Subiendo…' : 'Arrastrá un archivo o hacé clic para subir'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              PDF, JPG, PNG, WEBP o HEIC · máximo 15 MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={handleFileChange}
              disabled={isUploading}
              style={{ display: 'none' }}
            />
          </div>
          {uploadError && (
            <div
              role="alert"
              style={{ color: 'var(--color-error, #ff3b30)', fontSize: 13, marginTop: 8 }}
            >
              {uploadError}
            </div>
          )}
        </div>
      )}

      {/* Listado */}
      {isPending ? (
        <div aria-label="Cargando documentos" role="status">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{ height: 64, borderRadius: 8, background: '#f5f5f7', marginBottom: 12 }}
              className="animate-pulse"
            />
          ))}
        </div>
      ) : isError ? (
        <div role="alert" style={{ color: 'var(--color-error, #ff3b30)', fontSize: 14 }}>
          Error al cargar los documentos. Recargá la página.
        </div>
      ) : documents.length === 0 ? (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: 15,
            padding: '24px 0',
          }}
        >
          No hay documentos para este paciente
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {documents.map((doc) => (
            <li
              key={doc.document_id}
              style={{
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {doc.file_name}
                  </span>
                  <SourceBadge source={doc.source} />
                </div>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  {doc.mime_type} · {formatBytes(doc.size_bytes)} ·{' '}
                  {format(new Date(doc.created_at), 'd MMM yyyy · HH:mm', { locale: es })}
                </span>
              </div>
              <button
                onClick={() => void handleDownload(doc)}
                disabled={downloadingId === doc.document_id}
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--color-interactive, #0071e3)',
                  background: 'none',
                  border: '1px solid rgba(0,0,0,0.12)',
                  borderRadius: 8,
                  padding: '6px 14px',
                  cursor: downloadingId === doc.document_id ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {downloadingId === doc.document_id ? 'Generando…' : 'Descargar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
