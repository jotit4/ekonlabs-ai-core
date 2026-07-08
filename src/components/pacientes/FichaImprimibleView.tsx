'use client'

import { Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { STATUS_LABELS, type AppointmentStatus } from '@/types/appointments'
import type { FichaDossier } from '@/types/ficha'
import { calculateAge } from '@/lib/pacientes/ficha-helpers'

interface FichaImprimibleViewProps {
  dossier: FichaDossier
}

function fmtDate(iso: string | null | undefined, pattern = "d/MM/yyyy"): string {
  if (!iso) return '—'
  const parsed = parseISO(iso)
  if (!isValid(parsed)) return '—'
  return format(parsed, pattern, { locale: es })
}

function sessionStatusLabel(status: string | null): string {
  if (!status) return 'Pendiente'
  return STATUS_LABELS[status as AppointmentStatus] ?? status
}

function orDash(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '—'
}

/**
 * Vista imprimible de la "Ficha kinesiológica" (Fase 3) — réplica del papel de ISADI
 * (frente: cabecera de admisión + control de sesiones · dorso: evolución por sesión).
 *
 * Presentacional puro: recibe el dossier YA resuelto server-side (getFichaDossier).
 * 'use client' SOLO por window.print() del botón — sin fetch propio.
 *
 * Impresión: @media print aísla `.ficha-imprimible` (oculta todo lo demás, incluido
 * el sidebar/topbar del layout del dashboard — que este cambio NO puede tocar) con la
 * técnica "visibility hidden global + visible solo en el contenedor", en vez de
 * depender de selectores del layout compartido.
 */
export function FichaImprimibleView({ dossier }: FichaImprimibleViewProps) {
  const router = useRouter()
  const { patient, tratamientoObjetivo, treatments, evolucion, limitations } = dossier

  const edad = calculateAge(patient.date_of_birth)
  // Filas de la grilla unificada de sesiones = el bono con más sesiones.
  const maxSessions = treatments.length
    ? Math.max(...treatments.map((t) => t.rows.length))
    : 0
  const hayLimitaciones =
    limitations.clinicalFieldsUnavailable ||
    limitations.treatmentPlansUnavailable ||
    limitations.sessionNotesUnavailable

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      {/* Barra de acciones — oculta al imprimir */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => router.push(`/pacientes/${patient.patient_id}`)}
          style={{
            color: '#0071e3',
            fontSize: 15,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0',
          }}
        >
          ‹ Volver a la ficha
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 rounded-[8px] text-sm font-medium min-h-[44px] bg-[var(--color-interactive)] text-white hover:opacity-90 transition-opacity"
        >
          Imprimir / Guardar PDF
        </button>
      </div>

      {hayLimitaciones && (
        <div
          role="alert"
          className="no-print"
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            border: '1px solid rgba(0,0,0,0.1)',
            backgroundColor: '#fafafa',
            marginBottom: 16,
            fontSize: 13,
            color: 'var(--color-text-secondary)',
          }}
        >
          Algunos datos clínicos todavía no están disponibles en este entorno (migraciones
          pendientes de aplicar). La ficha impresa puede mostrar esos campos vacíos.
        </div>
      )}

      {/* ── Ficha (esto es lo único visible al imprimir) ──────────────────────── */}
      <div className="ficha-imprimible">
        <header className="ficha-header">
          <h1>ISADI — Ficha kinesiológica</h1>
        </header>

        {/* Bloque 1 — Cabecera de admisión */}
        <table className="ficha-table" aria-label="Cabecera de admisión">
          <tbody>
            <tr>
              <td className="ficha-label">Nombre</td>
              <td colSpan={3}>{patient.full_name}</td>
            </tr>
            <tr>
              <td className="ficha-label">Edad</td>
              <td>{edad != null ? `${edad} años` : '—'}</td>
              <td className="ficha-label">F.N.</td>
              <td>{fmtDate(patient.date_of_birth)}</td>
            </tr>
            <tr>
              <td className="ficha-label">Lugar</td>
              <td colSpan={3}>{orDash(patient.lugar)}</td>
            </tr>
            <tr>
              <td className="ficha-label">O.Social</td>
              <td colSpan={3}>
                {orDash(patient.obra_social)}
                {patient.obra_social_number ? ` (N° ${patient.obra_social_number})` : ''}
              </td>
            </tr>
            <tr>
              <td className="ficha-label">DNI</td>
              <td>{orDash(patient.dni)}</td>
              <td className="ficha-label">Cel</td>
              <td>{orDash(patient.phone_number)}</td>
            </tr>
            <tr>
              <td className="ficha-label">Dirección</td>
              <td colSpan={3}>{orDash(patient.address)}</td>
            </tr>
            <tr>
              <td className="ficha-label">KLGO a cargo</td>
              <td colSpan={3}>{orDash(patient.primary_professional_name)}</td>
            </tr>
            <tr>
              <td className="ficha-label">Derivación</td>
              <td colSpan={3}>{orDash(patient.derivacion)}</td>
            </tr>
            <tr>
              <td className="ficha-label">Ocupación</td>
              <td colSpan={3}>{orDash(patient.ocupacion)}</td>
            </tr>
            <tr>
              <td className="ficha-label">Diagnóstico</td>
              <td colSpan={3}>{orDash(patient.reason_for_visit)}</td>
            </tr>
            <tr>
              <td className="ficha-label">Antecedentes</td>
              <td colSpan={3}>{orDash(patient.antecedentes)}</td>
            </tr>
            <tr>
              <td className="ficha-label">Cirugías</td>
              <td colSpan={3}>{orDash(patient.cirugias)}</td>
            </tr>
            <tr>
              <td className="ficha-label">Act. Física</td>
              <td colSpan={3}>{orDash(patient.actividad_fisica)}</td>
            </tr>
            <tr>
              <td className="ficha-label">Tratamiento</td>
              <td colSpan={3}>{orDash(tratamientoObjetivo)}</td>
            </tr>
            <tr>
              <td className="ficha-label">Medicación</td>
              <td colSpan={3}>{orDash(patient.medicacion)}</td>
            </tr>
          </tbody>
        </table>

        {/* Bloque 2 — Control de sesiones (una grilla 1..N por tratamiento/bono) */}
        <section className="ficha-section" aria-label="Control de sesiones">
          <h2>Control de sesiones</h2>
          {treatments.length === 0 ? (
            <p className="ficha-empty">Este paciente no tiene paquetes/tratamientos cargados.</p>
          ) : (
            <table className="ficha-table ficha-sesiones-unificada">
              <thead>
                <tr>
                  {treatments.map((t) => (
                    <th key={t.treatment_id} colSpan={2}>
                      {orDash(t.service_name)}
                    </th>
                  ))}
                </tr>
                <tr>
                  {treatments.map((t) => (
                    <Fragment key={t.treatment_id}>
                      <th>N° sesión</th>
                      <th>Fecha</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxSessions }, (_, i) => (
                  <tr key={i}>
                    {treatments.map((t) => {
                      const row = t.rows[i]
                      return (
                        <Fragment key={t.treatment_id}>
                          <td>{row ? row.session_index : ''}</td>
                          <td>
                            {row
                              ? row.start_at
                                ? fmtDate(row.start_at)
                                : sessionStatusLabel(row.status)
                              : ''}
                          </td>
                        </Fragment>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Bloque 3 — Evolución por sesión (dorso del papel) */}
        <section className="ficha-section" aria-label="Evolución por sesión">
          <h2>Evolución por sesión</h2>
          {evolucion.length === 0 ? (
            <p className="ficha-empty">Sin evoluciones registradas.</p>
          ) : (
            <table className="ficha-table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Fecha</th>
                  <th>Detalle</th>
                  <th>Lic.</th>
                </tr>
              </thead>
              <tbody>
                {evolucion.map((row) => (
                  <tr key={row.session_note_id}>
                    <td>{row.session_index ?? '—'}</td>
                    <td>{fmtDate(row.start_at)}</td>
                    <td className="ficha-detalle-cell">
                      {orDash(
                        [row.worked_on, row.progress].filter(Boolean).join(' — ') || null,
                      )}
                    </td>
                    <td>{orDash(row.author_name)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Bloque 4 — Observaciones */}
        <section className="ficha-section" aria-label="Observaciones">
          <h2>Observaciones</h2>
          <div className="ficha-observaciones">{orDash(patient.notes)}</div>
        </section>
      </div>

      <style>{`
        @page {
          size: A4;
          margin: 10mm;
        }

        .ficha-imprimible {
          font-size: 12px;
          color: #000;
        }

        .ficha-header {
          text-align: center;
          margin-bottom: 8px;
        }
        .ficha-header h1 {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .ficha-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 8px;
          font-size: 12px;
        }
        .ficha-table th,
        .ficha-table td {
          border: 1px solid #000;
          padding: 3px 6px;
          text-align: left;
          vertical-align: top;
          line-height: 1.35;
        }
        .ficha-label {
          font-weight: 600;
          background: #f2f2f2;
          width: 120px;
          white-space: nowrap;
        }

        .ficha-section {
          margin-bottom: 10px;
        }
        .ficha-section h2 {
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .ficha-empty {
          font-size: 11px;
          color: rgba(0, 0, 0, 0.56);
        }

        /* Control de sesiones: grilla de columnas de ancho consistente, alineadas
           ARRIBA (align-items: start) — sin el estiramiento vertical del flex, que
           igualaba la altura de todas las tablas a la más larga. */
        /* Grilla de sesiones UNIFICADA: una sola tabla con las columnas de cada
           bono contiguas (réplica del papel: N° | Fecha | N° | Fecha …), sin huecos. */
        .ficha-sesiones-unificada th,
        .ficha-sesiones-unificada td {
          text-align: center;
        }

        .ficha-detalle-cell {
          white-space: pre-wrap;
        }

        .ficha-observaciones {
          min-height: 32px;
          border: 1px solid #000;
          padding: 6px;
          font-size: 11px;
          white-space: pre-wrap;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          body * {
            visibility: hidden;
          }
          .ficha-imprimible,
          .ficha-imprimible * {
            visibility: visible;
          }
          .ficha-imprimible {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          /* Evitar cortar tablas/secciones a la mitad entre páginas, SIN forzar
             página nueva (antes la evolución saltaba siempre a la página 2). */
          .ficha-table,
          .ficha-section {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}
