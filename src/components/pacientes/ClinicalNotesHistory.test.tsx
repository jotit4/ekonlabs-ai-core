import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockUseQuery, mockInvalidateQueries } = vi.hoisted(() => {
  const mockUseQuery = vi.fn()
  const mockInvalidateQueries = vi.fn()
  return { mockUseQuery, mockInvalidateQueries }
})

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: mockUseQuery,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  }
})

// Mock de ClinicalNoteEditor para aislar
vi.mock('./ClinicalNoteEditor', () => ({
  ClinicalNoteEditor: ({
    noteId,
    onSaved,
  }: {
    patientId: string
    noteId?: string
    initialContent?: string
    onSaved?: (note: {
      note_id: string
      content: string
      created_at: string
      updated_at: string
      author_id: string
      patient_id: string
    }) => void
  }) => (
    <div data-testid={`editor-${noteId ?? 'new'}`}>
      <button
        onClick={() =>
          onSaved?.({
            note_id: noteId ?? 'new',
            content: 'Editado',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T00:00:00Z',
            author_id: 'u1',
            patient_id: 'p1',
          })
        }
      >
        Guardar (mock)
      </button>
    </div>
  ),
}))

import { ClinicalNotesHistory } from './ClinicalNotesHistory'

// ── Datos de prueba ───────────────────────────────────────────────────────────

const mockNotes = [
  {
    note_id: 'note-1',
    content: 'Primera nota clínica',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    author_id: 'user-1',
    patient_id: 'p1',
  },
  {
    note_id: 'note-2',
    content: 'Segunda nota clínica',
    created_at: '2026-01-02T11:00:00Z',
    updated_at: '2026-01-02T12:00:00Z', // Editada
    author_id: 'user-1',
    patient_id: 'p1',
  },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClinicalNotesHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra skeletons mientras carga', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: true, isError: false })
    const { container } = render(<ClinicalNotesHistory patientId="p1" />)
    // Debe haber 3 skeletons con animate-pulse
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons).toHaveLength(3)
  })

  it('muestra notas con fecha y contenido cuando están cargadas', () => {
    mockUseQuery.mockReturnValue({
      data: { notes: mockNotes },
      isPending: false,
      isError: false,
    })
    render(<ClinicalNotesHistory patientId="p1" />)

    expect(screen.getByText('Primera nota clínica')).toBeInTheDocument()
    expect(screen.getByText('Segunda nota clínica')).toBeInTheDocument()
  })

  it('muestra "No hay notas para este paciente" cuando lista vacía', () => {
    mockUseQuery.mockReturnValue({
      data: { notes: [] },
      isPending: false,
      isError: false,
    })
    render(<ClinicalNotesHistory patientId="p1" />)
    expect(screen.getByText('No hay notas para este paciente')).toBeInTheDocument()
  })

  it('muestra error con role="alert" si falla la carga', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false, isError: true })
    render(<ClinicalNotesHistory patientId="p1" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/error al cargar las notas/i)).toBeInTheDocument()
  })

  it('click "Editar" muestra el editor con el contenido de esa nota', async () => {
    mockUseQuery.mockReturnValue({
      data: { notes: mockNotes },
      isPending: false,
      isError: false,
    })
    const user = userEvent.setup()
    render(<ClinicalNotesHistory patientId="p1" />)

    const editBtns = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editBtns[0])

    expect(screen.getByTestId('editor-note-1')).toBeInTheDocument()
  })

  it('indica que la nota fue editada si updated_at !== created_at', () => {
    mockUseQuery.mockReturnValue({
      data: { notes: mockNotes },
      isPending: false,
      isError: false,
    })
    render(<ClinicalNotesHistory patientId="p1" />)
    // La segunda nota tiene updated_at distinto de created_at
    expect(screen.getByText(/editado/i)).toBeInTheDocument()
  })
})
