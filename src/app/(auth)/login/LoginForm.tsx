'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { loginSchema, type LoginFormValues } from '@/lib/schemas/auth'
import { Button } from '@/components/ui/button'

const inputClass =
  'w-full rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2.5 text-[15px] ' +
  'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] ' +
  'focus:border-[#0071e3] focus:outline-none focus:shadow-[0_0_0_3px_rgba(0,113,227,0.12)] ' +
  'aria-invalid:border-[#ff3b30] dark:bg-[var(--color-surface)]'

export default function LoginForm() {
  const router = useRouter()
  const [authError, setAuthError] = useState<string | null>(null)

  // El botón de demo solo aparece con ?demo=1 en la URL — así NO se ve en el login
  // normal de producción (ISADI); solo cuando el vendedor entra con la URL del demo.
  const [showDemo, setShowDemo] = useState(false)
  useEffect(() => {
    setShowDemo(new URLSearchParams(window.location.search).get('demo') === '1')
  }, [])

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema as any) })

  const fillDemoCredentials = () => {
    setValue('email', 'demo@clinicademo.ar', { shouldValidate: false })
    setValue('password', 'DemoClinica2026!', { shouldValidate: false })
  }

  const onSubmit = async ({ email, password }: LoginFormValues) => {
    setAuthError(null)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setAuthError('Email o contraseña incorrectos')
      return
    }

    // Mandamos a "/" — la raíz redirige a cada usuario a SU landing según el rol
    // (recepción → /recepcion, dueño → /inicio, profesional → /mi-jornada).
    // Antes había un redirect hardcodeado a /agenda que ignoraba el rol.
    router.push('/')
    router.refresh()
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="mt-8 flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-[13px] font-medium text-[var(--color-text-primary)]"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          autoFocus
          autoComplete="email"
          className={inputClass}
          aria-describedby={errors.email ? 'email-error' : undefined}
          aria-invalid={!!errors.email}
          {...register('email')}
        />
        {errors.email && (
          <span
            id="email-error"
            role="alert"
            className="text-[13px] text-[#ff3b30]"
          >
            {errors.email.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-[13px] font-medium text-[var(--color-text-primary)]"
        >
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className={inputClass}
          aria-describedby={errors.password ? 'password-error' : undefined}
          aria-invalid={!!errors.password}
          {...register('password')}
        />
        {errors.password && (
          <span
            id="password-error"
            role="alert"
            className="text-[13px] text-[#ff3b30]"
          >
            {errors.password.message}
          </span>
        )}
      </div>

      {authError && (
        <div
          role="alert"
          aria-live="polite"
          className="text-[13px] text-[#ff3b30]"
        >
          {authError}
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-1 min-h-[44px] w-full"
      >
        {isSubmitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
      </Button>

      {showDemo && (
        <button
          type="button"
          onClick={fillDemoCredentials}
          className={
            'mt-1 w-full rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-transparent px-3 py-2 ' +
            'text-[13px] text-[var(--color-text-secondary)] hover:bg-[rgba(0,0,0,0.04)] ' +
            'focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 transition-colors'
          }
        >
          Completar credenciales demo
        </button>
      )}
    </form>
  )
}
