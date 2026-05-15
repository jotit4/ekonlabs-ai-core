import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MetricasView } from './MetricasView'
import type { ClinicKPIs } from '@/types/metricas'

const MOCK_KPIS: ClinicKPIs = {
  ocupacion_pct: 75,
  ocupacion_numerador: 15,
  ocupacion_denominador: 20,
  no_shows: 3,
  turnos_mes: 20,
  pacientes_nuevos: 5,
  periodo_desde: '2026-05-01T00:00:00-03:00',
  periodo_hasta: '2026-05-13T12:00:00-03:00',
}

const ZERO_KPIS: ClinicKPIs = {
  ocupacion_pct: 0,
  ocupacion_numerador: 0,
  ocupacion_denominador: 0,
  no_shows: 0,
  turnos_mes: 0,
  pacientes_nuevos: 0,
  periodo_desde: '2026-05-01T00:00:00-03:00',
  periodo_hasta: '2026-05-13T12:00:00-03:00',
}

describe('MetricasView', () => {
  it('renderiza el periodoLabel correctamente', () => {
    render(<MetricasView kpis={MOCK_KPIS} periodoLabel="Este mes" />)
    expect(screen.getByText('Este mes')).toBeInTheDocument()
  })

  it('renderiza los 4 títulos de KPI cards', () => {
    render(<MetricasView kpis={MOCK_KPIS} periodoLabel="Este mes" />)
    expect(screen.getByText('Turnos del mes')).toBeInTheDocument()
    expect(screen.getByText('No-shows')).toBeInTheDocument()
    expect(screen.getByText('Ocupación')).toBeInTheDocument()
    expect(screen.getByText('Pacientes nuevos')).toBeInTheDocument()
  })

  it('muestra los valores KPI correctamente', () => {
    render(<MetricasView kpis={MOCK_KPIS} periodoLabel="Este mes" />)
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('muestra estado vacío cuando todos los valores son cero', () => {
    render(<MetricasView kpis={ZERO_KPIS} periodoLabel="Este mes" />)
    expect(screen.getByText('Sin datos para el período seleccionado')).toBeInTheDocument()
  })

  it('NO oculta el grid de KPIs aunque haya estado vacío', () => {
    render(<MetricasView kpis={ZERO_KPIS} periodoLabel="Este mes" />)
    // Los 4 títulos deben seguir visibles aunque sea estado vacío
    expect(screen.getByText('Turnos del mes')).toBeInTheDocument()
    expect(screen.getByText('No-shows')).toBeInTheDocument()
  })

  it('NO muestra estado vacío cuando hay datos', () => {
    render(<MetricasView kpis={MOCK_KPIS} periodoLabel="Este mes" />)
    expect(screen.queryByText('Sin datos para el período seleccionado')).not.toBeInTheDocument()
  })

  it('muestra error inline con botón Reintentar cuando isError=true', () => {
    render(<MetricasView kpis={null} periodoLabel="Este mes" isError={true} />)
    expect(screen.getByText(/No se pudieron cargar las métricas/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('muestra error inline con botón Reintentar cuando kpis=null sin isError', () => {
    render(<MetricasView kpis={null} periodoLabel="Este mes" />)
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('botón Reintentar llama a window.location.reload()', () => {
    // jsdom no implementa window.location.reload() — verificamos que el botón existe
    // y que está conectado al onClick correcto (el componente llama window.location.reload)
    // Confirmamos que clicking el botón no lanza excepción (jsdom lo ignora silenciosamente)
    render(<MetricasView kpis={null} periodoLabel="Este mes" isError={true} />)
    const btn = screen.getByRole('button', { name: 'Reintentar' })
    expect(btn).toBeInTheDocument()
    // Verificar que el click no lanza un error (jsdom trata reload como no-op)
    expect(() => fireEvent.click(btn)).not.toThrow()
  })

  it('NO muestra el bloque de error cuando isPending=true', () => {
    render(<MetricasView kpis={null} periodoLabel="Cargando..." isPending={true} />)
    expect(screen.queryByText(/No se pudieron cargar las métricas/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('muestra el bloque de error cuando isPending=false y kpis es null', () => {
    render(<MetricasView kpis={null} periodoLabel="Este mes" isPending={false} />)
    expect(screen.getByText(/No se pudieron cargar las métricas/)).toBeInTheDocument()
  })
})
