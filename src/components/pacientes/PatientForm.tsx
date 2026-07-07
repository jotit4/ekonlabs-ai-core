'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQueryClient } from '@tanstack/react-query'
import { PatientFormSchema, type PatientFormValues } from '@/lib/schemas/patient.schema'
import { useProfessionals } from '@/hooks/use-professionals'
import type { Patient } from '@/types/patients'
import { ObraSocialSelector, type ObraSocialSelection } from './ObraSocialSelector'

// ─── Props ───────────────────────────────────────────────────────────────────

interface PatientFormProps {
  mode: 'create' | 'edit'
  patient?: Patient
  onSuccess?: (patientId: string) => void
}

// ─── Helpers de estilos ───────────────────────────────────────────────────────

function inputClass(hasError: boolean) {
  return [
    'w-full px-3 py-2 rounded-[8px] border text-sm',
    'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
    'focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive)]',
    hasError ? 'border-red-400' : 'border-[var(--color-border)]',
  ].join(' ')
}

function labelClass() {
  return 'block text-sm font-medium text-[var(--color-text-primary)] mb-1'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseObraSocial(rawValue: string | null | undefined): ObraSocialSelection | null {
  if (!rawValue) return null
  const parts = rawValue.split(' — ') // guión largo U+2014
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { entidad: parts[0].trim(), plan: parts[1].trim() }
  }
  // Datos legacy — mostrar solo en entidad, plan vacío
  return { entidad: rawValue.trim(), plan: '' }
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function PatientForm({ mode, patient, onSuccess }: PatientFormProps) {
  const queryClient = useQueryClient()

  // "KLGO a cargo" (migración 047 — ficha de admisión) — solo profesionales activos
  const { professionals } = useProfessionals()
  const activeProfessionals = professionals.filter((p) => p.active)

  // Estado local para el selector en cascada de obra social (Story 3.3)
  const [obraSocialSelection, setObraSocialSelection] = useState<ObraSocialSelection | null>(
    () => (mode === 'edit' && patient?.obra_social)
      ? parseObraSocial(patient.obra_social)
      : null
  )

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormValues>({
    resolver: standardSchemaResolver(PatientFormSchema),
    defaultValues:
      mode === 'edit' && patient
        ? {
            full_name: patient.full_name ?? '',
            phone_number: patient.phone_number ?? '',
            dni: patient.dni ?? '',
            date_of_birth: patient.date_of_birth ?? '',
            email: patient.email ?? '',
            obra_social: patient.obra_social ?? '',
            obra_social_number: patient.obra_social_number ?? '',
            notes: patient.notes ?? '',
            reason_for_visit: patient.reason_for_visit ?? '',
            alternative_phone: patient.alternative_phone ?? '',
            address: patient.address ?? '',
            lugar: patient.lugar ?? '',
            ocupacion: patient.ocupacion ?? '',
            derivacion: patient.derivacion ?? '',
            actividad_fisica: patient.actividad_fisica ?? '',
            primary_professional_id: patient.primary_professional_id ?? '',
          }
        : {
            full_name: '',
            phone_number: '',
            dni: '',
            date_of_birth: '',
            email: '',
            obra_social: '',
            obra_social_number: '',
            notes: '',
            reason_for_visit: '',
            alternative_phone: '',
            address: '',
            lugar: '',
            ocupacion: '',
            derivacion: '',
            actividad_fisica: '',
            primary_professional_id: '',
          },
  })

  const onSubmit = async (data: PatientFormValues) => {
    // Validar combinación inválida: entidad seleccionada pero sin plan (AC4)
    if (obraSocialSelection?.entidad && !obraSocialSelection?.plan) {
      setError('obra_social', { message: 'Seleccioná un plan de cobertura' })
      return
    }

    try {
      const url =
        mode === 'create'
          ? '/api/patients'
          : `/api/patients/${patient!.patient_id}`

      // Serializar obra_social: "Entidad — Plan" (guión largo U+2014) o null
      const obraSocialValue = obraSocialSelection
        ? `${obraSocialSelection.entidad} — ${obraSocialSelection.plan}`.trim()
        : null

      const body = {
        ...data,
        obra_social: obraSocialValue,
      }

      const response = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      // Manejo de 409 — DNI o teléfono duplicado
      if (response.status === 409) {
        const errorBody = await response.json()
        if (errorBody.error?.includes('DNI')) {
          setError('dni', { message: 'Ya existe un paciente con ese DNI' })
        } else {
          setError('phone_number', { message: 'Ya existe un paciente con ese teléfono' })
        }
        return
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        // Error genérico — mostrar en phone_number como campo principal o en root
        setError('phone_number', { message: errorBody.error ?? 'Error al guardar el paciente' })
        return
      }

      const responseBody = await response.json()

      if (mode === 'create') {
        const newPatientId = responseBody.patient?.patient_id as string
        queryClient.invalidateQueries({ queryKey: ['patients', 'list'] })
        onSuccess?.(newPatientId)
      } else {
        const patientId = patient!.patient_id
        queryClient.invalidateQueries({ queryKey: ['patients', 'one', patientId] })
        queryClient.invalidateQueries({ queryKey: ['patients', 'list'] })
        onSuccess?.(patientId)
      }
    } catch {
      setError('phone_number', { message: 'Error de red. Verificá tu conexión e intentá de nuevo.' })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

      {/* ── Sección: Datos principales ─────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] pb-1">
          Datos principales
        </legend>

        {/* full_name */}
        <div>
          <label htmlFor="full_name" className={labelClass()}>
            Nombre completo <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <input
            id="full_name"
            type="text"
            autoComplete="name"
            {...register('full_name')}
            className={inputClass(!!errors.full_name)}
            aria-invalid={!!errors.full_name}
            aria-describedby={errors.full_name ? 'full-name-error' : undefined}
            aria-required="true"
          />
          {errors.full_name && (
            <p id="full-name-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.full_name.message}
            </p>
          )}
        </div>

        {/* phone_number */}
        <div>
          <label htmlFor="phone_number" className={labelClass()}>
            Teléfono <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <input
            id="phone_number"
            type="tel"
            autoComplete="tel"
            {...register('phone_number')}
            className={inputClass(!!errors.phone_number)}
            aria-invalid={!!errors.phone_number}
            aria-describedby={errors.phone_number ? 'phone-number-error' : undefined}
            aria-required="true"
          />
          {errors.phone_number && (
            <p id="phone-number-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.phone_number.message}
            </p>
          )}
        </div>
      </fieldset>

      {/* ── Sección: Identificación ────────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] pb-1">
          Identificación
        </legend>

        {/* dni */}
        <div>
          <label htmlFor="dni" className={labelClass()}>
            DNI
          </label>
          <input
            id="dni"
            type="text"
            placeholder="12345678"
            {...register('dni')}
            className={inputClass(!!errors.dni)}
            aria-invalid={!!errors.dni}
            aria-describedby={errors.dni ? 'dni-error' : undefined}
          />
          {errors.dni && (
            <p id="dni-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.dni.message}
            </p>
          )}
        </div>

        {/* date_of_birth */}
        <div>
          <label htmlFor="date_of_birth" className={labelClass()}>
            Fecha de nacimiento
          </label>
          <input
            id="date_of_birth"
            type="date"
            {...register('date_of_birth')}
            className={inputClass(!!errors.date_of_birth)}
            aria-invalid={!!errors.date_of_birth}
          />
        </div>

        {/* email */}
        <div>
          <label htmlFor="email" className={labelClass()}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            className={inputClass(!!errors.email)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.email.message}
            </p>
          )}
        </div>
      </fieldset>

      {/* ── Sección: Cobertura médica ──────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] pb-1">
          Cobertura médica
        </legend>

        {/* obra_social — selector en cascada (Story 3.3) */}
        <div>
          <label className={labelClass()}>
            Obra social
          </label>
          <ObraSocialSelector
            value={obraSocialSelection}
            onChange={setObraSocialSelection}
            disabled={isSubmitting}
          />
          {errors.obra_social && (
            <p id="obra-social-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.obra_social.message}
            </p>
          )}
        </div>

        {/* obra_social_number */}
        <div>
          <label htmlFor="obra_social_number" className={labelClass()}>
            Número de afiliado
          </label>
          <input
            id="obra_social_number"
            type="text"
            {...register('obra_social_number')}
            className={inputClass(!!errors.obra_social_number)}
            aria-invalid={!!errors.obra_social_number}
          />
        </div>
      </fieldset>

      {/* ── Sección: Adicionales ──────────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] pb-1">
          Información adicional
        </legend>

        {/* address */}
        <div>
          <label htmlFor="address" className={labelClass()}>
            Domicilio
          </label>
          <input
            id="address"
            type="text"
            autoComplete="street-address"
            {...register('address')}
            className={inputClass(!!errors.address)}
            aria-invalid={!!errors.address}
          />
        </div>

        {/* alternative_phone */}
        <div>
          <label htmlFor="alternative_phone" className={labelClass()}>
            Teléfono alternativo
          </label>
          <input
            id="alternative_phone"
            type="tel"
            {...register('alternative_phone')}
            className={inputClass(!!errors.alternative_phone)}
            aria-invalid={!!errors.alternative_phone}
          />
        </div>

        {/* reason_for_visit */}
        <div>
          <label htmlFor="reason_for_visit" className={labelClass()}>
            Motivo de consulta
          </label>
          <textarea
            id="reason_for_visit"
            rows={3}
            {...register('reason_for_visit')}
            className={inputClass(!!errors.reason_for_visit)}
            aria-invalid={!!errors.reason_for_visit}
          />
        </div>

        {/* notes */}
        <div>
          <label htmlFor="notes" className={labelClass()}>
            Notas
          </label>
          <textarea
            id="notes"
            rows={3}
            {...register('notes')}
            className={inputClass(!!errors.notes)}
            aria-invalid={!!errors.notes}
          />
        </div>
      </fieldset>

      {/* ── Sección: Ficha de admisión (migración 047 — Fase 1 digitalización) ── */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] pb-1">
          Ficha de admisión
        </legend>

        {/* lugar */}
        <div>
          <label htmlFor="lugar" className={labelClass()}>
            Lugar
          </label>
          <input
            id="lugar"
            type="text"
            {...register('lugar')}
            className={inputClass(!!errors.lugar)}
            aria-invalid={!!errors.lugar}
          />
        </div>

        {/* ocupacion */}
        <div>
          <label htmlFor="ocupacion" className={labelClass()}>
            Ocupación
          </label>
          <input
            id="ocupacion"
            type="text"
            {...register('ocupacion')}
            className={inputClass(!!errors.ocupacion)}
            aria-invalid={!!errors.ocupacion}
          />
        </div>

        {/* derivacion */}
        <div>
          <label htmlFor="derivacion" className={labelClass()}>
            Derivación
          </label>
          <input
            id="derivacion"
            type="text"
            {...register('derivacion')}
            className={inputClass(!!errors.derivacion)}
            aria-invalid={!!errors.derivacion}
          />
        </div>

        {/* actividad_fisica */}
        <div>
          <label htmlFor="actividad_fisica" className={labelClass()}>
            Actividad física
          </label>
          <input
            id="actividad_fisica"
            type="text"
            {...register('actividad_fisica')}
            className={inputClass(!!errors.actividad_fisica)}
            aria-invalid={!!errors.actividad_fisica}
          />
        </div>

        {/* primary_professional_id — KLGO a cargo (select de profesionales activos) */}
        <div>
          <label htmlFor="primary_professional_id" className={labelClass()}>
            KLGO a cargo
          </label>
          <select
            id="primary_professional_id"
            {...register('primary_professional_id')}
            className={inputClass(!!errors.primary_professional_id)}
            aria-invalid={!!errors.primary_professional_id}
          >
            <option value="">Sin asignar</option>
            {activeProfessionals.map((professional) => (
              <option key={professional.professional_id} value={professional.professional_id}>
                {professional.name}
              </option>
            ))}
          </select>
          {errors.primary_professional_id && (
            <p id="primary-professional-id-error" role="alert" className="mt-1 text-xs text-red-600">
              {errors.primary_professional_id.message}
            </p>
          )}
        </div>
      </fieldset>

      {/* ── Botón submit ───────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={[
          'w-full px-4 py-2 rounded-[8px] text-sm font-medium',
          'bg-[var(--color-interactive)] text-white',
          'hover:opacity-90 transition-opacity min-h-[44px]',
          isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {isSubmitting ? 'Guardando...' : mode === 'create' ? 'Crear paciente' : 'Guardar cambios'}
      </button>
    </form>
  )
}
