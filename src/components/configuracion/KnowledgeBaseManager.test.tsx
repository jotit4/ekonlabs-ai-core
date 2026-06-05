import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const {
  mockUseKnowledgeTopics,
  mockUseReindexTopic,
  mockUseDeleteTopic,
} = vi.hoisted(() => ({
  mockUseKnowledgeTopics: vi.fn(),
  mockUseReindexTopic: vi.fn(),
  mockUseDeleteTopic: vi.fn(),
}))

vi.mock('@/hooks/use-knowledge-topics', () => ({
  useKnowledgeTopics: mockUseKnowledgeTopics,
  useReindexTopic: mockUseReindexTopic,
  useDeleteTopic: mockUseDeleteTopic,
}))

import { KnowledgeBaseManager } from './KnowledgeBaseManager'

const TOPICS = [
  {
    source_filename: 'obras-sociales',
    chunk_count: 2,
    content: 'OSDE se acepta',
    updated_at: '2026-06-04T00:00:00Z',
  },
  {
    source_filename: 'general',
    chunk_count: 1,
    content: 'Horario 9 a 18',
    updated_at: '2026-06-04T00:00:00Z',
  },
]

let reindexMutate: ReturnType<typeof vi.fn>
let deleteMutate: ReturnType<typeof vi.fn>

function setupMocks(
  topicsOverride: Partial<ReturnType<typeof mockUseKnowledgeTopics>> = {},
) {
  mockUseKnowledgeTopics.mockReturnValue({
    topics: TOPICS,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...topicsOverride,
  })
  reindexMutate = vi.fn()
  deleteMutate = vi.fn()
  mockUseReindexTopic.mockReturnValue({ mutate: reindexMutate, isPending: false })
  mockUseDeleteTopic.mockReturnValue({ mutate: deleteMutate, isPending: false })
}

describe('KnowledgeBaseManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('renderiza los temas desde useKnowledgeTopics', () => {
    render(<KnowledgeBaseManager />)
    expect(screen.getByText('OSDE se acepta')).toBeInTheDocument()
    expect(screen.getByText('Horario 9 a 18')).toBeInTheDocument()
    expect(screen.getByText('obras-sociales')).toBeInTheDocument()
    expect(screen.getByText('general')).toBeInTheDocument()
  })

  it('muestra skeleton role=status mientras carga', () => {
    setupMocks({ isPending: true })
    render(<KnowledgeBaseManager />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('muestra error con Reintentar', () => {
    const refetch = vi.fn()
    setupMocks({ isError: true, refetch })
    render(<KnowledgeBaseManager />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Reintentar'))
    expect(refetch).toHaveBeenCalled()
  })

  it('muestra estado vacío cuando no hay temas', () => {
    setupMocks({ topics: [] })
    render(<KnowledgeBaseManager />)
    expect(screen.getByText(/Todavía no hay temas/i)).toBeInTheDocument()
  })

  // El tema con un botón Editar/Borrar dado se ubica por su <li> contenedor.
  function topicRow(content: string): HTMLElement {
    return screen.getByText(content).closest('li') as HTMLElement
  }

  it('crear tema nuevo reindexa con {source, content}', async () => {
    render(<KnowledgeBaseManager />)
    fireEvent.change(screen.getByLabelText('Contenido'), {
      target: { value: 'Nueva entrada' },
    })
    fireEvent.change(screen.getByLabelText('Tema (opcional)'), {
      target: { value: 'faq' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tema' }))

    await waitFor(() => expect(reindexMutate).toHaveBeenCalled())
    expect(reindexMutate.mock.calls[0][0]).toEqual({
      source: 'faq',
      content: 'Nueva entrada',
    })
  })

  it('crear sin tema usa "general" por defecto', async () => {
    render(<KnowledgeBaseManager />)
    fireEvent.change(screen.getByLabelText('Contenido'), {
      target: { value: 'Sin tema' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tema' }))

    await waitFor(() => expect(reindexMutate).toHaveBeenCalled())
    expect(reindexMutate.mock.calls[0][0]).toEqual({
      source: 'general',
      content: 'Sin tema',
    })
  })

  it('editar precarga el contenido del tema y reindexa con {source, content}', async () => {
    render(<KnowledgeBaseManager />)
    const row = topicRow('OSDE se acepta')
    fireEvent.click(within(row).getByText('Editar'))

    const textarea = screen.getByLabelText('Editar contenido del tema') as HTMLTextAreaElement
    expect(textarea.value).toBe('OSDE se acepta')

    fireEvent.change(textarea, { target: { value: 'OSDE editado' } })
    fireEvent.click(screen.getByText('Guardar'))

    await waitFor(() => expect(reindexMutate).toHaveBeenCalled())
    expect(reindexMutate.mock.calls[0][0]).toEqual({
      source: 'obras-sociales',
      content: 'OSDE editado',
    })
  })

  it('borrar tema confirma en 2 pasos y llama useDeleteTopic con el source', async () => {
    render(<KnowledgeBaseManager />)
    const row = topicRow('OSDE se acepta')
    fireEvent.click(within(row).getByText('Borrar'))
    // Aún no se borró: aparece el paso de confirmación.
    expect(deleteMutate).not.toHaveBeenCalled()
    expect(within(row).getByText('Confirmar borrado')).toBeInTheDocument()

    fireEvent.click(within(row).getByText('Confirmar borrado'))
    await waitFor(() => expect(deleteMutate).toHaveBeenCalled())
    expect(deleteMutate.mock.calls[0][0]).toBe('obras-sociales')
  })

  it('oculta acciones de escritura para doctor (canEdit=false)', () => {
    render(<KnowledgeBaseManager canEdit={false} />)
    expect(screen.queryByText('Agregar tema')).not.toBeInTheDocument()
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    expect(screen.queryByText('Borrar')).not.toBeInTheDocument()
    // Pero sí muestra la lista (lectura).
    expect(screen.getByText('OSDE se acepta')).toBeInTheDocument()
  })
})
