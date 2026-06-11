'use client'

import { useState } from 'react'
import { PatientDocuments } from '@/components/pacientes/PatientDocuments'

interface HceEstudiosPanelProps {
  patientId: string
  readOnly?: boolean
}

/**
 * Estudios y documentos del paciente en el contexto HCE (Story 14.5 — Epic 14).
 *
 * Wrapper colapsable que RE-EXPONE el repositorio de documentos del Epic 11
 * (`PatientDocuments`) dentro del tab "Notas clínicas". Reuso total: upload,
 * listado, signed URL ≤60s, badge Manual/WhatsApp y auditoría son los de
 * Epic 11 — acá no hay lógica de datos, solo el estado `expanded`.
 *
 * SIN gate interno de rol (decisión de permisos de la Story 14.5): los
 * documentos son visibles a receptionist/doctor/admin BY DESIGN de la
 * migración 028 (la recepción carga autorizaciones y órdenes). Gatear acá
 * sería teatro de seguridad: protegería datos que receptionist ve en su tab
 * "Documentos". El anclaje (tab `notas` de la ficha) ya está gateado a
 * doctor/admin.
 *
 * SIN `treatment_id` / filtro por tratamiento (decisión de diseño de la
 * Story 14.5): la HCE lista TODOS los documentos del paciente — la columna
 * no aporta a escala ISADI y reintroduciría una dependencia de runtime que
 * esta story no tiene (028 está aplicada en prod desde mayo).
 *
 * Colapsado por defecto = `PatientDocuments` NO montado = cero fetch al
 * abrir la ficha (su useQuery solo corre al montar).
 */
export function HceEstudiosPanel({ patientId, readOnly = false }: HceEstudiosPanelProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mb-6 rounded-[8px] border border-[var(--color-border)] p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex min-h-[44px] items-center gap-1 text-sm font-medium text-[var(--color-interactive)] hover:underline"
      >
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        Estudios y documentos
      </button>

      {expanded && (
        <div className="mt-2">
          <p className="mb-3 text-xs text-[var(--color-text-secondary)]">
            Mismo repositorio que el tab Documentos — incluye autorizaciones y órdenes cargadas
            por recepción.
          </p>
          <PatientDocuments patientId={patientId} readOnly={readOnly} />
        </div>
      )}
    </div>
  )
}
