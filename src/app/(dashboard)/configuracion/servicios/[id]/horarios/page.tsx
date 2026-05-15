import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseJwtPayload } from '@/lib/utils/jwt'
import { ServiceHoursView } from '@/components/configuracion/ServiceHoursView'

export const dynamic = 'force-dynamic'

export default async function ServiceHorariosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createSupabaseServerClient()

  // 1. Autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 2. Autorización
  const { data: { session } } = await supabase.auth.getSession()
  const claims = parseJwtPayload(session?.access_token ?? '')
  if (claims?.app_role !== 'admin') {
    redirect('/agenda')
  }

  // 3. Verificar que el servicio existe y pertenece al tenant (RLS filtra automáticamente)
  const { id } = await params
  const { data: service } = await supabase
    .from('services')
    .select('service_id, name')
    .eq('service_id', id)
    .single()

  if (!service) {
    redirect('/configuracion/servicios')
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm text-[var(--color-text-secondary)]">Configuración / Servicios</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">
          {service.name} — Horarios
        </h1>
      </header>
      <ServiceHoursView serviceId={id} serviceName={service.name} />
    </section>
  )
}
