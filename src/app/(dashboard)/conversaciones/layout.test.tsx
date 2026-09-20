import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

// Hallazgo 5: el banner de "Shadow mode" aparecía duplicado en Conversaciones
// porque se montaba acá Y en el layout raíz del dashboard. Este layout ya NO
// debe montar su propio ShadowModeBanner.

vi.mock('@/components/ShadowModeBanner', () => ({
  ShadowModeBanner: () => <div data-testid="shadow-mode-banner" />,
}))

vi.mock('@/components/conversaciones/ConversationListSidebar', () => ({
  ConversationListSidebar: () => <div data-testid="conversation-list-sidebar" />,
}))

import ConversacionesLayout from './layout'

describe('ConversacionesLayout', () => {
  it('NO monta su propio ShadowModeBanner (ya lo monta el layout raíz)', () => {
    render(
      <ConversacionesLayout>
        <div data-testid="children" />
      </ConversacionesLayout>,
    )

    expect(screen.queryByTestId('shadow-mode-banner')).not.toBeInTheDocument()
    expect(screen.getByTestId('conversation-list-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('children')).toBeInTheDocument()
  })
})
