import type { AccessControlProvider } from '@refinedev/core'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { parseJwtPayload } from '@/lib/utils/jwt'
import type { UserRole } from '@/types/index'

const PERMISSIONS: Record<UserRole, Record<string, string[]>> = {
  receptionist: {
    agenda: ['list', 'show'],
    pacientes: ['list', 'show'],
    conversaciones: ['list', 'show'],
  },
  doctor: {
    agenda: ['list', 'show'],
    pacientes: ['list', 'show', 'edit'],
  },
  admin: {
    agenda: ['list', 'show', 'create', 'edit', 'delete'],
    pacientes: ['list', 'show', 'create', 'edit', 'delete'],
    conversaciones: ['list', 'show'],
    configuracion: ['list', 'show', 'edit'],
    metricas: ['list', 'show'],
    usuarios: ['list', 'show', 'create', 'edit', 'delete'],
  },
}

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const supabase = createSupabaseBrowserClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) return { can: false, reason: 'No hay sesión activa' }

    const claims = parseJwtPayload(session.access_token)
    const role = claims?.role as UserRole

    if (!role || !PERMISSIONS[role]) return { can: false, reason: 'Rol desconocido' }
    if (!resource) return { can: true }

    const allowed = PERMISSIONS[role][resource] ?? []
    const can = allowed.includes(action)

    return {
      can,
      reason: can ? undefined : `Rol ${role}: sin permiso para ${action} en ${resource}`,
    }
  },
}
