import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/auth/claims'
import { ServiceHoursView } from '@/components/configuracion/ServiceHoursView'

export const dynamic = 'force-dynamic'

export default async function ServiceHorariosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const auth = await getAuthClaims()
  if (!auth) redirect('/login')
  if (auth.role !== 'admin') {
    redirect('/agenda')
  }

  // 3. Verificar que el servicio existe y pertenece al tenant (RLS filtra automáticamente)
  const supabase = await createSupabaseServerClient()
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
