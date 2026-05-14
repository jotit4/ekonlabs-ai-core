'use client'

import { ShadowModeBanner } from '@/components/ShadowModeBanner'
import { ConversationListSidebar } from '@/components/conversaciones/ConversationListSidebar'

export default function ConversacionesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ShadowModeBanner />
      <div
        id="main-content"
        className="grid grid-cols-1 lg:grid-cols-[284px_1fr] h-full overflow-hidden"
      >
        <ConversationListSidebar />
        {children}
      </div>
    </>
  )
}
