'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { startOfMonth } from 'date-fns'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toZonedTime, formatInTimeZone } from 'date-fns-tz'
import { FiltroFechasMetricas } from './FiltroFechasMetricas'
import { MetricasView } from './MetricasView'
import { TendenciasTurnosSection } from './TendenciasTurnosSection'
import { DistribucionServiciosSection } from './DistribucionServiciosSection'
import { useClinicKPIs } from '@/hooks/use-clinic-kpis'
import { useAgentKPIs } from '@/hooks/use-agent-kpis'

const TZ = 'America/Argentina/Buenos_Aires'

function calcularRangoPorDefecto(): { desde: string; hasta: string } {
  const ahora = new Date()
  const ahoraArg = toZonedTime(ahora, TZ)
  const inicioMesArg = startOfMonth(ahoraArg)
  return {
    desde: formatInTimeZone(inicioMesArg, TZ, "yyyy-MM-dd'T'HH:mm:ssxxx"),
    hasta: formatInTimeZone(ahora, TZ, "yyyy-MM-dd'T'HH:mm:ssxxx"),
  }
}

function isValidISO(str: string): boolean {
  return !isNaN(new Date(str).getTime())
}

function derivarPeriodoLabel(desde: string, hasta: string, esPorDefecto: boolean): string {
  if (esPorDefecto) return 'Este mes'
  try {
    const desdeDate = new Date(desde)
    const hastaDate = new Date(hasta)
    const desdeStr = format(desdeDate, 'd MMM', { locale: es }) // "1 may"
    const hastaStr = format(hastaDate, 'd MMM yyyy', { locale: es }) // "13 may 2026"
    return `${desdeStr} – ${hastaStr}`
  } catch {
    return 'Período personalizado'
  }
}

function buildMetricasURL(desde: string, hasta: string): string {
  const params = new URLSearchParams({ desde, hasta })
  return `/metricas?${params.toString()}`
}

export function MetricasClientWrapper() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const desdeURL = searchParams.get('desde')
  const hastaURL = searchParams.get('hasta')

  // Usar URL params si presentes y válidos, sino rango por defecto
  const rangoPorDefecto = calcularRangoPorDefecto()
  const periodoDesde = desdeURL && isValidISO(desdeURL) ? desdeURL : rangoPorDefecto.desde
  const periodoHasta = hastaURL && isValidISO(hastaURL) ? hastaURL : rangoPorDefecto.hasta

  const esRangoPorDefecto = !desdeURL || !hastaURL

  const { kpis, isPending: clinicPending, isError: clinicError } = useClinicKPIs({ desde: periodoDesde, hasta: periodoHasta })
  const { kpis: agentKpis, isError: agentError } = useAgentKPIs({ desde: periodoDesde, hasta: periodoHasta })

  function handleAplicarFiltro(desde: string, hasta: string) {
    router.push(buildMetricasURL(desde, hasta))
  }

  function handleLimpiarFiltro() {
    router.push('/metricas')
  }

  const periodoLabel = derivarPeriodoLabel(periodoDesde, periodoHasta, esRangoPorDefecto)

  return (
    <>
      <FiltroFechasMetricas
        periodoDesde={periodoDesde}
        periodoHasta={periodoHasta}
        esRangoPorDefecto={esRangoPorDefecto}
        onAplicar={handleAplicarFiltro}
        onLimpiar={handleLimpiarFiltro}
      />
      <MetricasView
        kpis={kpis}
        agentKpis={agentKpis}
        agentKpisError={agentError}
        periodoLabel={periodoLabel}
        isError={clinicError}
        isPending={clinicPending}
      />
      <TendenciasTurnosSection periodoDesde={periodoDesde} periodoHasta={periodoHasta} />
      <DistribucionServiciosSection periodoDesde={periodoDesde} periodoHasta={periodoHasta} />
    </>
  )
}
