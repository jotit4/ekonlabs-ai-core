import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  // 1. Validar sesión
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Obtener query param ?dni=
  const { searchParams } = new URL(request.url)
  const dni = searchParams.get('dni')

  if (!dni || !/^\d{7,8}$/.test(dni)) {
    return Response.json({ error: 'Ingresá un DNI válido de 7 u 8 dígitos' }, { status: 400 })
  }

  // 3. Buscar paciente por DNI — RLS filtra por tenant automáticamente
  const { data, error } = await supabase
    .from('patients')
    .select('patient_id, full_name, phone_number, obra_social')
    .eq('dni', dni)
    .maybeSingle()

  if (error) {
    console.error('[patients/search/GET] error:', error)
    return Response.json({ error: 'Error al buscar paciente' }, { status: 500 })
  }

  if (!data) {
    return Response.json({ patient: null }, { status: 200 })
  }

  return Response.json({ patient: data }, { status: 200 })
}
