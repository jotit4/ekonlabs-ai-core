'use client'

import { useCurrentTenant } from '@/hooks/use-current-tenant'
import { useUserManagement } from '@/hooks/use-user-management'
import { UserCreateForm } from './UserCreateForm'
import type { DashboardUser } from '@/types/index'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  receptionist: 'Recepcionista',
  doctor: 'Médico',
}

function UserTableSkeleton() {
  return (
    <div role="status" aria-label="Cargando usuarios" className="animate-pulse space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 bg-[var(--color-surface)] rounded-[8px]" />
      ))}
    </div>
  )
}

export function UserManagementView() {
  const { role: currentRole } = useCurrentTenant()
  const { users, isLoading, isError, refetch, toggleUserStatus, isToggling, currentUserId } =
    useUserManagement()

  if (currentRole !== 'admin') {
    return (
      <div role="alert" className="p-4 text-[var(--color-text-secondary)]">
        Acceso denegado. Solo los administradores pueden ver esta página.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Formulario de creación */}
      <div className="bg-[var(--color-surface)] rounded-[12px] p-6 border border-[var(--color-border)]">
        <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)] mb-4">
          Invitar nuevo usuario
        </h2>
        <UserCreateForm onSuccess={refetch} />
      </div>

      {/* Lista de usuarios */}
      <div>
        <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)] mb-4">
          Usuarios del equipo
        </h2>

        {isLoading && <UserTableSkeleton />}

        {isError && !isLoading && (
          <div role="alert" className="flex items-center gap-3 p-4 bg-[var(--color-surface)] rounded-[8px] border border-[var(--color-border)]">
            <span className="text-[var(--color-text-secondary)]">
              No se pudo cargar la lista de usuarios.
            </span>
            <button
              onClick={refetch}
              className="text-[var(--color-interactive)] text-sm font-medium hover:underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {!isLoading && !isError && users.length === 0 && (
          <p className="text-[var(--color-text-secondary)] text-sm">
            No hay usuarios en este tenant todavía.
          </p>
        )}

        {!isLoading && !isError && users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-secondary)]">
                  <th className="pb-2 pr-4 font-medium">Nombre completo</th>
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Rol</th>
                  <th className="pb-2 pr-4 font-medium">Estado</th>
                  <th className="pb-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {users.map((u: DashboardUser) => {
                  const isSelf = u.user_id === currentUserId
                  return (
                    <tr key={u.id} className="h-12">
                      <td className="pr-4 text-[var(--color-text-primary)]">
                        {u.full_name || '—'}
                      </td>
                      <td className="pr-4 text-[var(--color-text-secondary)]">
                        {u.email || '—'}
                      </td>
                      <td className="pr-4 text-[var(--color-text-secondary)]">
                        {ROLE_LABELS[u.role] ?? u.role}
                      </td>
                      <td className="pr-4">
                        <span
                          className={[
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                            u.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800',
                          ].join(' ')}
                        >
                          {u.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        {isSelf ? (
                          <span className="text-xs text-[var(--color-text-secondary)]">(tú)</span>
                        ) : (
                          <button
                            onClick={() => toggleUserStatus(u.user_id, !u.is_active)}
                            disabled={isToggling === u.user_id}
                            className={[
                              'text-xs font-medium px-3 py-1 rounded-[6px] border transition-colors min-h-[36px]',
                              u.is_active
                                ? 'border-red-300 text-red-700 hover:bg-red-50'
                                : 'border-green-300 text-green-700 hover:bg-green-50',
                              isToggling === u.user_id ? 'opacity-50 cursor-not-allowed' : '',
                            ].join(' ')}
                          >
                            {isToggling === u.user_id
                              ? 'Guardando...'
                              : u.is_active
                              ? 'Desactivar'
                              : 'Activar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
