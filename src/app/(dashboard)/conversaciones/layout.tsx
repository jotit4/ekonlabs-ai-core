'use client'

import { ConversationListSidebar } from '@/components/conversaciones/ConversationListSidebar'

// ShadowModeBanner ya se monta una vez en el layout raíz del dashboard
// (src/app/(dashboard)/layout.tsx) — montarlo también acá lo duplicaba,
// uno debajo del otro, en toda la sección de Conversaciones (hallazgo 5).
export default function ConversacionesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="main-content"
      className="grid grid-cols-1 lg:grid-cols-[284px_1fr] h-full overflow-hidden"
    >
      <ConversationListSidebar />
      {children}
    </div>
  )
}
