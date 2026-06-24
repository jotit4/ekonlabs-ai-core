'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Calendar, CalendarClock, ChartBar, Home, Layers, MessageSquare, PanelLeft,
  PanelLeftClose, Settings, ShieldCheck, UserCheck, UserCog, UserX, Users,
} from 'lucide-react'
import type { UserRole } from '@/types/index'
import { UserProfileButton } from './UserProfileButton'

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
}

// "Inicio" lleva al landing propio de cada rol, DIRECTO (sin el salto por "/").
// Recepción → /recepcion, dueño → /inicio, profesional → /mi-jornada.
// Mantener sincronizado con LANDING_BY_ROLE de src/app/page.tsx.
// Va destacado y primero, fuera de la lista por rol, igual en todas las pantallas.
const HOME_HREF_BY_ROLE: Record<UserRole, string> = {
  receptionist: '/recepcion',
  doctor: '/mi-jornada',
  admin: '/inicio',
}
const HOME_LABEL = 'Inicio'

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  receptionist: [
    { href: '/conversaciones', label: 'Conversaciones', icon: MessageSquare },
    { href: '/agenda',         label: 'Calendario',      icon: Calendar },
    { href: '/pacientes',      label: 'Pacientes',        icon: Users },
    { href: '/configuracion/profesionales', label: 'Profesionales', icon: UserCheck },
  ],
  doctor: [
    { href: '/agenda/mi-agenda',     label: 'Mi Agenda',         icon: UserCheck },
    { href: '/mi-disponibilidad',    label: 'Mi Disponibilidad', icon: CalendarClock },
    { href: '/pacientes',            label: 'Pacientes',         icon: Users },
  ],
  admin: [
    { href: '/conversaciones',                label: 'Conversaciones', icon: MessageSquare },
    { href: '/agenda',                        label: 'Calendario',      icon: Calendar },
    { href: '/pacientes',                     label: 'Pacientes',        icon: Users },
    { href: '/configuracion/agente',          label: 'Configuración',   icon: Settings },
    { href: '/metricas',                      label: 'Métricas',         icon: ChartBar },
    { href: '/configuracion/usuarios',        label: 'Usuarios',         icon: UserCog },
    { href: '/configuracion/servicios',       label: 'Servicios',        icon: Layers },
    { href: '/configuracion/profesionales',   label: 'Profesionales',    icon: UserCheck },
    { href: '/configuracion/auditoria',       label: 'Auditoría',        icon: ShieldCheck },
    { href: '/configuracion/supresion',       label: 'Supresiones',      icon: UserX },
  ],
}

export function AppSidebar({ role }: { role: UserRole }) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const items = NAV_ITEMS[role] ?? NAV_ITEMS.receptionist

  // "Inicio" lleva al landing del rol y se resalta cuando estás en esa página.
  const homeHref = HOME_HREF_BY_ROLE[role] ?? '/agenda'
  const homeActive = pathname === homeHref || pathname.startsWith(homeHref + '/')
  const HomeIcon = Home

  return (
    <>
      {/* Desktop sidebar — visible at lg (1024px) and above */}
      <nav
        aria-label="Navegación principal"
        className={[
          'hidden lg:flex flex-col h-screen border-r border-[var(--color-border)]',
          'bg-[var(--color-bg)] transition-[width] duration-200 ease-in-out overflow-hidden',
          collapsed ? 'w-16' : 'w-[220px]',
        ].join(' ')}
      >
        <div className="flex items-center h-14 px-3 border-b border-[var(--color-border)]">
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            aria-expanded={!collapsed}
            className="p-2 rounded-[8px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] transition-colors duration-120"
          >
            {collapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
          </button>
          {!collapsed && (
            <span className="ml-2 text-[13px] font-semibold text-[var(--color-text-primary)] truncate">
              ekonlabs
            </span>
          )}
        </div>

        <ul className="flex-1 flex flex-col gap-1 p-2 pt-3" role="list">
          {/* Inicio — primero y destacado. Lleva a "/" (redirige por rol). */}
          <li>
            <Link
              href={homeHref}
              aria-current={homeActive ? 'page' : undefined}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-[8px] min-h-[44px]',
                'text-[14px] font-semibold transition-colors duration-120',
                homeActive
                  ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] border-l-2 border-[var(--color-interactive)]'
                  : 'text-[var(--color-interactive)] hover:bg-[var(--color-surface)]',
              ].join(' ')}
            >
              <HomeIcon size={20} className="shrink-0" />
              {!collapsed && <span className="truncate">{HOME_LABEL}</span>}
            </Link>
          </li>

          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'flex items-center gap-3 px-3 py-2.5 rounded-[8px] min-h-[44px]',
                    'text-[14px] font-medium transition-colors duration-120',
                    active
                      ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] border-l-2 border-[var(--color-interactive)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]',
                  ].join(' ')}
                >
                  <Icon size={20} className="shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Footer del sidebar — perfil y logout */}
        <div className="p-2 border-t border-[var(--color-border)]">
          <UserProfileButton collapsed={collapsed} />
        </div>
      </nav>

      {/* Mobile bottom nav — visible below lg (1024px) */}
      <nav
        aria-label="Navegación móvil"
        className="lg:hidden fixed bottom-0 inset-x-0 flex items-center justify-around
          h-14 border-t border-[var(--color-border)] bg-[var(--color-bg)] z-40"
      >
        {/* Inicio — primero también en móvil. Lleva a "/" (redirige por rol). */}
        <Link
          href={homeHref}
          aria-current={homeActive ? 'page' : undefined}
          aria-label={HOME_LABEL}
          className={[
            'flex flex-col items-center gap-0.5 px-4 py-2 min-h-[44px] min-w-[44px]',
            'text-[10px] font-semibold transition-colors duration-120',
            homeActive
              ? 'text-[var(--color-interactive)]'
              : 'text-[var(--color-interactive)]',
          ].join(' ')}
        >
          <HomeIcon size={22} />
          <span>{HOME_LABEL}</span>
        </Link>

        {items.slice(0, 3).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              className={[
                'flex flex-col items-center gap-0.5 px-4 py-2 min-h-[44px] min-w-[44px]',
                'text-[10px] transition-colors duration-120',
                active
                  ? 'text-[var(--color-interactive)]'
                  : 'text-[var(--color-text-secondary)]',
              ].join(' ')}
            >
              <Icon size={22} />
              <span>{label}</span>
            </Link>
          )
        })}
        <UserProfileButton collapsed={true} />
      </nav>
    </>
  )
}
