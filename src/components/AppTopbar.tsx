'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home } from 'lucide-react'
import type { UserRole } from '@/types/index'
import { landingForRole } from '@/lib/landing'

// Título legible por sección (primer segmento de la ruta). Sin jerga.
const SECTION_TITLE: Record<string, string> = {
  recepcion: 'Inicio',
  inicio: 'Inicio',
  'mi-jornada': 'Inicio',
  agenda: 'Agenda',
  pacientes: 'Pacientes',
  conversaciones: 'Conversaciones',
  configuracion: 'Configuración',
  metricas: 'Métricas',
  'mi-disponibilidad': 'Mi disponibilidad',
  'mi-perfil': 'Mi perfil',
}

/**
 * Barra superior fija y persistente, presente en TODOS los módulos del dashboard.
 * A la izquierda, un botón "Inicio" siempre visible que lleva a cada rol a SU
 * landing. Cuando NO estás en tu inicio, muestra además en qué módulo estás
 * ("Inicio / Pacientes") para ubicar a la persona.
 */
export function AppTopbar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const homeHref = landingForRole(role)
  const isHome = pathname === homeHref

  const section = pathname.split('/')[1] ?? ''
  const title = SECTION_TITLE[section] ?? ''
  const showTitle = !!title && !isHome

  return (
    <header
      className="shrink-0 flex items-center gap-2 h-14 px-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]"
    >
      <Link
        data-tour="topbar-inicio"
        href={homeHref}
        aria-current={isHome ? 'page' : undefined}
        aria-label="Ir a Inicio"
        className={[
          'inline-flex items-center gap-2 px-3 py-2 rounded-[8px] min-h-[40px]',
          'text-[14px] font-semibold transition-colors duration-120',
          isHome
            ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)]'
            : 'text-[var(--color-interactive)] hover:bg-[var(--color-surface)]',
        ].join(' ')}
      >
        <Home size={18} className="shrink-0" />
        <span>Inicio</span>
      </Link>

      {showTitle && (
        <>
          <span aria-hidden className="text-[var(--color-text-secondary)]">
            /
          </span>
          <span className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
            {title}
          </span>
        </>
      )}
    </header>
  )
}
