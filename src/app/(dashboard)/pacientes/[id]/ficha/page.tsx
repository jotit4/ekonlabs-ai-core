import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getFichaDossier } from '@/lib/pacientes/ficha-dossier'
import { FichaImprimibleView } from '@/components/pacientes/FichaImprimibleView'

export const dynamic = 'force-dynamic'

// GET /pacientes/[id]/ficha — Ficha kinesiológica imprimible (réplica del papel, Fase 3).
// Accesible por los 3 roles (admin/doctor/receptionist): en ISADI los 3 cargan la ficha.
// El gate de auth es el mismo patrón que el resto de las páginas del dashboard
// (segunda capa detrás de proxy.ts / layout.tsx — NO se tocan acá).
export default async function FichaPacientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const dossier = await getFichaDossier(supabase, id)
  if (!dossier) redirect('/pacientes')

  return <FichaImprimibleView dossier={dossier} />
}
