'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut, ChevronDown, IdCard } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/hooks/use-current-user'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import type { UserRole } from '@/types'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  doctor: 'Médico',
  receptionist: 'Recepcionista',
}

interface UserProfileButtonProps {
  collapsed: boolean
}

export function UserProfileButton({ collapsed }: UserProfileButtonProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, isLoading } = useCurrentUser()

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    queryClient.removeQueries({ queryKey: ['auth', 'current-user'] })
    router.push('/login')
  }

  if (isLoading) {
    return (
      <div
        className={[
          'animate-pulse rounded-[8px] bg-[var(--color-surface)]',
          collapsed ? 'w-9 h-9 min-h-[44px] min-w-[44px]' : 'h-10 w-full',
        ].join(' ')}
        aria-hidden="true"
      />
    )
  }

  if (!user) return null

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Abrir menú de perfil"
        className={[
          'flex items-center rounded-[8px] transition-colors duration-120',
          'hover:bg-[var(--color-surface)] text-[var(--color-text-secondary)]',
          collapsed
            ? 'justify-center w-9 h-9 min-h-[44px] min-w-[44px]'
            : 'gap-2 px-2 py-1.5 w-full',
        ].join(' ')}
      >
        {/* Avatar con iniciales */}
        <span
          className={[
            'shrink-0 flex items-center justify-center rounded-full',
            'bg-[var(--color-interactive)] text-white font-semibold',
            collapsed ? 'w-9 h-9 text-[14px]' : 'w-7 h-7 text-[12px]',
          ].join(' ')}
          aria-hidden="true"
        >
          {user.initials}
        </span>

        {/* Nombre y rol — solo visible expandido */}
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate leading-tight">
                {user.fullName}
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)] truncate leading-tight">
                {ROLE_LABELS[user.role]}
              </p>
            </div>
            <ChevronDown size={14} className="shrink-0" aria-hidden="true" />
          </>
        )}
      </PopoverTrigger>

      <PopoverContent side="top" align="start" className="w-64 p-0">
        {/* Header del perfil */}
        <div className="px-3 py-2 border-b border-[var(--color-border)]">
          <p className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate">
            {user.fullName}
          </p>
          <p className="text-[12px] text-[var(--color-text-secondary)] truncate">
            {user.email}
          </p>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
            {ROLE_LABELS[user.role]}
          </p>
        </div>

        {/* Acciones de cuenta */}
        <div className="p-1">
          <Link
            href="/mi-perfil"
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-[var(--color-text-primary)]
              hover:bg-[var(--color-surface)] rounded-[6px] transition-colors duration-120 min-h-[36px]"
          >
            <IdCard size={15} aria-hidden="true" />
            Mi Perfil
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-[var(--color-text-primary)]
              hover:bg-[var(--color-surface)] rounded-[6px] transition-colors duration-120 min-h-[36px]"
          >
            <LogOut size={15} aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
