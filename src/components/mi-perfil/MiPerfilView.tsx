'use client'

import { AccountDataSection } from './AccountDataSection'
import { ProfessionalDataSection } from './ProfessionalDataSection'

// Story 10.8 — Mi Perfil. Compone:
//   - AccountDataSection: siempre visible (admin / receptionist / doctor)
//   - ProfessionalDataSection: solo si role === 'doctor'
export function MiPerfilView({ role }: { role: string }) {
  return (
    <div className="space-y-8" data-testid="mi-perfil-view">
      <AccountDataSection role={role} />
      {role === 'doctor' && <ProfessionalDataSection />}
    </div>
  )
}
