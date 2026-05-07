import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { parseJwtPayload } from '@/lib/utils/jwt'

const PROTECTED_PATHS = [
  '/agenda',
  '/pacientes',
  '/conversaciones',
  '/configuracion',
  '/metricas',
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

  // getUser() validates against the Auth server — more secure than getSession()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && isProtectedPath(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isProtectedPath(pathname)) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.access_token) {
      const claims = parseJwtPayload(session.access_token)
      if (claims?.tenant_id) {
        supabaseResponse.headers.set('x-tenant-id', claims.tenant_id as string)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
