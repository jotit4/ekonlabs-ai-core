import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PATHS = [
  '/agenda',
  '/pacientes',
  '/conversaciones',
  '/configuracion',
  '/metricas',
  '/recepcion',
  '/inicio',
  '/mi-jornada',
  '/mi-disponibilidad',
  '/mi-perfil',
]

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => pathname.startsWith(path))
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse('Server configuration error', { status: 500 })
  }

  // Strip any client-supplied x-tenant-id before it reaches RSCs
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-tenant-id')

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({
          request: { headers: requestHeaders },
        })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  // `getClaims()` refresca una sesión vencida y persiste las cookies mediante
  // setAll, igual que requiere el patrón SSR oficial. Con JWT asimétrico ES256
  // verifica firma + expiración contra la JWKS cacheada, evitando el round-trip
  // de `getUser()` a Supabase Auth en CADA navegación del dashboard.
  const { data, error } = await supabase.auth.getClaims()
  const claims = !error ? data?.claims : null
  const isAuthenticated = typeof claims?.sub === 'string'

  const { pathname } = request.nextUrl

  if (!isAuthenticated && isProtectedPath(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAuthenticated && isProtectedPath(pathname)) {
    if (typeof claims?.tenant_id === 'string') {
      supabaseResponse.headers.set('x-tenant-id', claims.tenant_id)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
