import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'

const {
  mockUseKnowledge,
  mockUseCreateKnowledge,
  mockUseUpdateKnowledge,
  mockUseDeleteKnowledge,
} = vi.hoisted(() => ({
  mockUseKnowledge: vi.fn(),
  mockUseCreateKnowledge: vi.fn(),
  mockUseUpdateKnowledge: vi.fn(),
  mockUseDeleteKnowledge: vi.fn(),
}))

vi.mock('@/hooks/use-knowledge', () => ({ useKnowledge: mockUseKnowledge }))
vi.mock('@/hooks/use-knowledge-mutations', () => ({
  useCreateKnowledge: mockUseCreateKnowledge,
  useUpdateKnowledge: mockUseUpdateKnowledge,
  useDeleteKnowledge: mockUseDeleteKnowledge,
}))

import { KnowledgeBaseManager } from './KnowledgeBaseManager'

const ENTRIES = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    content: 'OSDE se acepta',
    source_filename: 'obras-sociales',
    chunk_index: 0,
    created_at: '2026-06-04T00:00:00Z',
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    content: 'Horario 9 a 18',
    source_filename: 'general',
    chunk_index: 0,
    created_at: '2026-06-04T00:00:00Z',
  },
]

let createMutate: ReturnType<typeof vi.fn>
let updateMutate: ReturnType<typeof vi.fn>
let deleteMutate: ReturnType<typeof vi.fn>

function setupMocks(
  knowledge: Partial<ReturnType<typeof mockUseKnowledge>> = {},
) {
  mockUseKnowledge.mockReturnValue({
    entries: ENTRIES,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...knowledge,
  })
  createMutate = vi.fn()
  updateMutate = vi.fn()
  deleteMutate = vi.fn()
  mockUseCreateKnowledge.mockReturnValue({ mutate: createMutate, isPending: false })
  mockUseUpdateKnowledge.mockReturnValue({ mutate: updateMutate, isPending: false })
  mockUseDeleteKnowledge.mockReturnValue({ mutate: deleteMutate, isPending: false })
}

describe('KnowledgeBaseManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('renderiza la lista agrupada por tema', () => {
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

  it('muestra estado vacío cuando no hay entradas', () => {
    setupMocks({ entries: [] })
    render(<KnowledgeBaseManager />)
    expect(screen.getByText(/Todavía no hay entradas/i)).toBeInTheDocument()
  })

  // La entrada con un botón Editar/Borrar dado se ubica por su <li> contenedor.
  function entryRow(content: string): HTMLElement {
    return screen.getByText(content).closest('li') as HTMLElement
  }

  it('crear envía el payload', async () => {
    render(<KnowledgeBaseManager />)
    fireEvent.change(screen.getByLabelText('Contenido'), {
      target: { value: 'Nueva entrada' },
    })
    fireEvent.change(screen.getByLabelText('Tema (opcional)'), {
      target: { value: 'faq' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar entrada' }))

    await waitFor(() => expect(createMutate).toHaveBeenCalled())
    expect(createMutate.mock.calls[0][0]).toEqual({
      content: 'Nueva entrada',
      source_filename: 'faq',
    })
  })

  it('editar precarga el contenido y envía la actualización', async () => {
    render(<KnowledgeBaseManager />)
    const row = entryRow('OSDE se acepta')
    fireEvent.click(within(row).getByText('Editar'))

    const textarea = screen.getByLabelText('Editar contenido') as HTMLTextAreaElement
    expect(textarea.value).toBe('OSDE se acepta')

    fireEvent.change(textarea, { target: { value: 'OSDE editado' } })
    fireEvent.click(screen.getByText('Guardar'))

    await waitFor(() => expect(updateMutate).toHaveBeenCalled())
    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      id: ENTRIES[0].id,
      content: 'OSDE editado',
    })
  })

  it('borrar pide confirmación antes de mutar', async () => {
    render(<KnowledgeBaseManager />)
    const row = entryRow('OSDE se acepta')
    fireEvent.click(within(row).getByText('Borrar'))
    // Aún no se mutó: aparece el paso de confirmación.
    expect(deleteMutate).not.toHaveBeenCalled()
    expect(within(row).getByText('Confirmar borrado')).toBeInTheDocument()

    fireEvent.click(within(row).getByText('Confirmar borrado'))
    await waitFor(() => expect(deleteMutate).toHaveBeenCalled())
    expect(deleteMutate.mock.calls[0][0]).toBe(ENTRIES[0].id)
  })

  it('oculta acciones de escritura para doctor (canEdit=false)', () => {
    render(<KnowledgeBaseManager canEdit={false} />)
    expect(screen.queryByText('Agregar entrada')).not.toBeInTheDocument()
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    expect(screen.queryByText('Borrar')).not.toBeInTheDocument()
    // Pero sí muestra la lista (lectura).
    expect(screen.getByText('OSDE se acepta')).toBeInTheDocument()
  })
})
