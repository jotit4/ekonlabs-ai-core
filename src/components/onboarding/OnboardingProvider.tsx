'use client'

import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { getTourForRoute } from '@/lib/onboarding/tours'
import { hasSeenTour, markTourSeen } from '@/lib/onboarding/storage'
import type { UserRole } from '@/types/index'

// ─── Contexto ────────────────────────────────────────────────────────────────

interface OnboardingContextValue {
  /** Lanza (o relanza) el tour de la pantalla actual. No-op si no hay tour. */
  startTour: () => void
  /** true si la pantalla actual tiene tour para el rol del usuario */
  hasTour: boolean
}

const OnboardingContext = createContext<OnboardingContextValue>({
  startTour: () => {},
  hasTour: false,
})

export function useOnboarding(): OnboardingContextValue {
  return useContext(OnboardingContext)
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function OnboardingProvider({
  role,
  children,
}: {
  role: UserRole
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const driverRef = useRef<Driver | null>(null)
  const tour = getTourForRoute(role, pathname)

  const startTour = useCallback(() => {
    if (!tour) return
    // Un solo driver activo a la vez
    driverRef.current?.destroy()
    const instance = driver({
      showProgress: tour.steps.length > 1,
      progressText: '{{current}} de {{total}}',
      nextBtnText: 'Siguiente',
      prevBtnText: 'Anterior',
      doneBtnText: 'Listo',
      steps: tour.steps,
    })
    driverRef.current = instance
    // Marcar visto al iniciar: si lo cierra a mitad, no lo volvemos a interrumpir
    markTourSeen(tour.id)
    instance.drive()
  }, [tour])

  // Auto-disparo: primera vez que el rol pisa una pantalla con tour
  useEffect(() => {
    if (!tour || hasSeenTour(tour.id)) return
    const timer = setTimeout(startTour, 600) // dejar renderizar la pantalla
    return () => clearTimeout(timer)
  }, [tour, startTour])

  // Cerrar el tour activo al cambiar de ruta o desmontar
  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
      driverRef.current = null
    }
  }, [pathname])

  return (
    <OnboardingContext.Provider value={{ startTour, hasTour: tour !== null }}>
      {children}
      {tour && <TourHelpButton screen={tour.screen} onClick={startTour} />}
    </OnboardingContext.Provider>
  )
}

// ─── Botón "?" persistente ───────────────────────────────────────────────────

function TourHelpButton({ screen, onClick }: { screen: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour="help-button"
      aria-label={`Ayuda: ver guía de ${screen}`}
      title={`Ver guía de ${screen}`}
      className="fixed right-4 bottom-[72px] lg:bottom-5 z-50 flex h-11 w-11 items-center
        justify-center rounded-full border border-[var(--color-border)]
        bg-[var(--color-bg)] text-[18px] font-semibold text-[var(--color-text-secondary)]
        shadow-md transition-colors duration-120 hover:bg-[var(--color-surface)]
        hover:text-[var(--color-text-primary)]"
    >
      ?
    </button>
  )
}
