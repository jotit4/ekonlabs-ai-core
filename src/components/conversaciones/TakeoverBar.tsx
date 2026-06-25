'use client'

import { useRef, useEffect, useState } from 'react'
import { useTakeover } from '@/hooks/use-takeover'
import { useSendMessage } from '@/hooks/use-send-message'
import { useRelease } from '@/hooks/use-release'
import type { ConversationStatus, ConfidenceLevel } from '@/types/conversations'

// Límite de tamaño para adjuntos (debe coincidir con el de la route)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

interface TakeoverBarProps {
  phone: string
  conversationStatus: ConversationStatus
  confidenceLevel?: ConfidenceLevel
  controlledBy?: string
  currentUserName?: string
}

const confidenceLabels: Record<ConfidenceLevel, string> = {
  high: 'Activo',
  medium: 'Confianza media',
  low: 'Necesita ayuda',
}

export function TakeoverBar({
  phone,
  conversationStatus,
  confidenceLevel = 'medium',
  controlledBy,
  currentUserName,
}: TakeoverBarProps) {
  // Nombre a mostrar en "[Nombre] · En control": prioriza quién tomó el control
  // (derivado del hilo), luego el usuario actual, luego un genérico.
  const controllerName = controlledBy ?? currentUserName ?? 'Operador'
  const { takeover, isPending } = useTakeover()
  const { release, isPending: isPendingRelease } = useRelease(phone)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastMessageRef = useRef('')
  const [messageText, setMessageText] = useState('')
  const { sendMessage, isPending: isPendingSend, isError: isSendError, reset: resetSend } = useSendMessage(phone)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  // Foco automático al textarea cuando se toma control (UX-DR22)
  useEffect(() => {
    if (conversationStatus === 'human_takeover') {
      textareaRef.current?.focus()
    }
  }, [conversationStatus])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setFileError(null)
    if (!file) {
      setAttachedFile(null)
      return
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError('El archivo supera el límite de 10 MB.')
      setAttachedFile(null)
      // Resetear el input para permitir volver a elegir
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setAttachedFile(file)
  }

  const handleRemoveFile = () => {
    setAttachedFile(null)
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSend = () => {
    const hasText = messageText.trim().length > 0
    const hasFile = attachedFile !== null
    if ((!hasText && !hasFile) || isPendingSend) return
    lastMessageRef.current = messageText
    if (hasFile) {
      sendMessage(messageText, [attachedFile])
    } else {
      sendMessage(messageText)
    }
    setMessageText('')
    setAttachedFile(null)
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  // Estado resuelto: sin acciones
  if (conversationStatus === 'resolved') {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          textAlign: 'center',
        }}
      >
        Conversación resuelta
      </div>
    )
  }

  // Estado humano en control
  if (conversationStatus === 'human_takeover') {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
        }}
      >
        {/* Header de estado humano */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
            {controllerName} · En control
          </span>
          {/* "Liberar al agente" — ghost button, activado en Story 4.7 */}
          <button
            aria-label="Liberar al agente"
            data-tour="release-btn"
            onClick={() => release()}
            disabled={isPendingRelease}
            style={{
              background: 'none',
              border: 'none',
              cursor: isPendingRelease ? 'not-allowed' : 'pointer',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              opacity: isPendingRelease ? 0.6 : 1,
              padding: '4px 8px',
            }}
          >
            {isPendingRelease ? 'Liberando...' : 'Liberar al agente'}
          </button>
        </div>

        {/* Compose area (Story 4.6 activa el envío) */}
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Preview del adjunto seleccionado */}
          {attachedFile && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 8,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                fontSize: 13,
              }}
            >
              <span aria-hidden="true">📎</span>
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--color-text-primary)',
                }}
              >
                {attachedFile.name}
              </span>
              <button
                type="button"
                onClick={handleRemoveFile}
                aria-label="Quitar adjunto"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  color: 'var(--color-text-secondary)',
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Error de tamaño de archivo */}
          {fileError && (
            <div
              role="alert"
              style={{
                fontSize: 12,
                color: 'var(--color-status-alert)',
                padding: '2px 0',
              }}
            >
              {fileError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {/* Input file oculto */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,video/*"
              aria-label="Seleccionar archivo adjunto"
              onChange={handleFileChange}
              disabled={isPendingSend}
              style={{ display: 'none' }}
            />

            {/* Botón de adjuntar — aria-label distinto del input para evitar ambigüedad */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPendingSend}
              aria-label="Adjuntar archivo"
              title="Adjuntar imagen, PDF o video (máx. 10 MB)"
              style={{
                background: 'none',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: '8px 10px',
                cursor: isPendingSend ? 'not-allowed' : 'pointer',
                fontSize: 16,
                color: 'var(--color-text-secondary)',
                opacity: isPendingSend ? 0.4 : 1,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              📎
            </button>

            <textarea
              ref={textareaRef}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribí un mensaje..."
              aria-label="Escribí tu mensaje"
              data-tour="reply-input"
              disabled={isPendingSend}
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                border: `1px solid ${isSendError ? 'var(--color-status-alert)' : 'var(--color-border)'}`,
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 14,
                color: 'var(--color-text-primary)',
                background: 'var(--color-surface)',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleSend}
              disabled={(!messageText.trim() && !attachedFile) || isPendingSend}
              aria-label="Enviar mensaje"
              style={{
                background: 'var(--color-interactive)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 500,
                opacity: ((!messageText.trim() && !attachedFile) || isPendingSend) ? 0.4 : 1,
                cursor: ((!messageText.trim() && !attachedFile) || isPendingSend) ? 'not-allowed' : 'pointer',
              }}
            >
              {isPendingSend ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
          {isSendError && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
                fontSize: 12,
                color: 'var(--color-status-alert)',
              }}
            >
              <span>Error al enviar. El mensaje no se perdió.</span>
              <button
                onClick={() => { resetSend(); sendMessage(lastMessageRef.current) }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 12,
                  color: 'var(--color-interactive)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Estado agente activo (ai_active | needs_intervention)
  const agentLabel = confidenceLabels[confidenceLevel] ?? 'Activo'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Agente IA · {agentLabel}
      </span>
      <button
        onClick={() => takeover(phone)}
        disabled={isPending}
        aria-label="Asumir control de la conversación"
        data-tour="takeover-btn"
        style={{
          background: 'var(--color-interactive)',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 500,
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Asumiendo control...' : 'Asumir control'}
      </button>
    </div>
  )
}
