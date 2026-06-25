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

import {
  KnowledgeBaseManager,
  prettyTopicName,
  summaryLine,
} from './KnowledgeBaseManager'

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

// Encuentra el <li> que contiene el texto dado (aparece en resumen del acordeón)
function topicRow(text: string): HTMLElement {
  return screen.getByText(text).closest('li') as HTMLElement
}

// Devuelve el botón de toggle de un tema por su nombre legible
function toggleBtn(prettyName: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(prettyName) })
}

// Devuelve la región de contenido expandido del tema (por nombre accesible del botón header)
// Nota: la <section aria-label="..."> también es role="region", pero su nombre es diferente.
function accordionRegion(prettyName: string): HTMLElement {
  return screen.getByRole('region', { name: new RegExp(prettyName) })
}

describe('KnowledgeBaseManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  // ── Estados de carga ─────────────────────────────────────────────────────────

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

  // ── Lista con acordeón ───────────────────────────────────────────────────────

  it('renderiza los nombres legibles (prettyTopicName) de los temas', () => {
    render(<KnowledgeBaseManager />)
    // Nombres legibles en los headers (no el source_filename crudo)
    expect(screen.getByText('Obras sociales')).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
    // Resumen de 1 línea visible (contenido corto → aparece completo)
    expect(screen.getByText('OSDE se acepta')).toBeInTheDocument()
    expect(screen.getByText('Horario 9 a 18')).toBeInTheDocument()
  })

  it('header muestra el contador de temas', () => {
    render(<KnowledgeBaseManager />)
    expect(screen.getByText(/Qué sabe tu asistente \(2\)/)).toBeInTheDocument()
  })

  it('acordeón cerrado por defecto — aria-expanded=false en todos los headers', () => {
    render(<KnowledgeBaseManager />)
    // Sólo los botones de toggle tienen aria-expanded
    const accordionToggles = screen
      .getAllByRole('button')
      .filter((btn) => btn.getAttribute('aria-expanded') !== null)
    expect(accordionToggles.length).toBeGreaterThan(0)
    accordionToggles.forEach((btn) => {
      expect(btn).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('acordeón cerrado por defecto — el contenido completo NO está en el DOM', () => {
    const topics = [
      {
        source_filename: 'test-md',
        chunk_count: 1,
        content: '## Título real\n\nContenido extenso aquí',
        updated_at: '2026-06-04T00:00:00Z',
      },
    ]
    setupMocks({ topics })
    render(<KnowledgeBaseManager />)
    // El resumen muestra el título (sin ##)
    expect(screen.getByText('Título real')).toBeInTheDocument()
    // El contenido del cuerpo del acordeón NO está en el DOM
    expect(screen.queryByText('Contenido extenso aquí')).not.toBeInTheDocument()
    // No hay región de acordeón expandida (la <section> sí es región, con otro nombre)
    expect(
      screen.queryByRole('region', { name: /Test md/ }),
    ).not.toBeInTheDocument()
  })

  it('acordeón — click en header expande y muestra contenido formateado', () => {
    render(<KnowledgeBaseManager />)
    const btn = toggleBtn('Obras sociales')
    expect(btn).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(btn)

    expect(btn).toHaveAttribute('aria-expanded', 'true')
    const region = accordionRegion('Obras sociales')
    expect(region).toBeInTheDocument()
    expect(within(region).getByText('OSDE se acepta')).toBeInTheDocument()
  })

  it('acordeón — click de nuevo colapsa el contenido', () => {
    render(<KnowledgeBaseManager />)
    const btn = toggleBtn('Obras sociales')

    fireEvent.click(btn)
    expect(accordionRegion('Obras sociales')).toBeInTheDocument()

    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('region', { name: /Obras sociales/ }),
    ).not.toBeInTheDocument()
  })

  it('acordeón — varios temas se pueden expandir independientemente', () => {
    render(<KnowledgeBaseManager />)
    const [btnObrasSociales, btnGeneral] = screen
      .getAllByRole('button')
      .filter((btn) => btn.getAttribute('aria-expanded') !== null)

    fireEvent.click(btnObrasSociales)
    fireEvent.click(btnGeneral)

    expect(btnObrasSociales).toHaveAttribute('aria-expanded', 'true')
    expect(btnGeneral).toHaveAttribute('aria-expanded', 'true')
    expect(accordionRegion('Obras sociales')).toBeInTheDocument()
    expect(accordionRegion('General')).toBeInTheDocument()
  })

  it('acordeón — el header tiene aria-controls apuntando a la región de contenido', () => {
    render(<KnowledgeBaseManager />)
    const btn = toggleBtn('Obras sociales')
    const controlsId = btn.getAttribute('aria-controls')
    expect(controlsId).toBeTruthy()

    fireEvent.click(btn)
    const region = document.getElementById(controlsId!)
    expect(region).not.toBeNull()
    expect(region).toHaveAttribute('role', 'region')
  })

  // ── prettyTopicName (unit) ──────────────────────────────────────────────────

  describe('prettyTopicName', () => {
    it('quita extensión y capitaliza como frase', () => {
      expect(prettyTopicName('INFO_GENERAL.MD')).toBe('Info general')
      expect(prettyTopicName('obras-sociales')).toBe('Obras sociales')
      expect(prettyTopicName('general')).toBe('General')
      expect(prettyTopicName('FAQ.txt')).toBe('Faq')
      expect(prettyTopicName('mi_tema_nuevo')).toBe('Mi tema nuevo')
    })

    it('colapsa múltiples separadores', () => {
      expect(prettyTopicName('a--b__c')).toBe('A b c')
    })

    it('devuelve el source original si queda vacío tras limpiar', () => {
      expect(prettyTopicName('.md')).toBe('.md')
    })
  })

  // ── summaryLine (unit) ──────────────────────────────────────────────────────

  describe('summaryLine', () => {
    it('devuelve la primera línea no vacía sin símbolos markdown', () => {
      expect(summaryLine('## Título\n\nContenido')).toBe('Título')
      expect(summaryLine('**Negrita** y normal')).toBe('Negrita y normal')
      expect(summaryLine('- Ítem de lista')).toBe('Ítem de lista')
      expect(summaryLine('> Cita')).toBe('Cita')
    })

    it('trunca a 90 chars y agrega ellipsis', () => {
      const largo = 'A'.repeat(100)
      const resultado = summaryLine(largo)
      expect(resultado).toHaveLength(91) // 90 + '…'
      expect(resultado.endsWith('…')).toBe(true)
    })

    it('salta líneas vacías hasta encontrar contenido', () => {
      expect(summaryLine('\n\n\nContenido real')).toBe('Contenido real')
    })

    it('devuelve string vacío si el contenido está vacío', () => {
      expect(summaryLine('')).toBe('')
      expect(summaryLine('\n\n')).toBe('')
    })
  })

  // ── Markdown formateado al ver (no símbolos crudos) ──────────────────────────

  it('no muestra ## ni ** como texto crudo al expandir el acordeón', () => {
    const topics = [
      {
        source_filename: 'md-test',
        chunk_count: 1,
        content: '## Título principal\n\n**Texto en negrita** y normal',
        updated_at: '2026-06-04T00:00:00Z',
      },
    ]
    setupMocks({ topics })
    render(<KnowledgeBaseManager />)

    // Expandir
    const btn = toggleBtn('Md test')
    fireEvent.click(btn)

    const region = accordionRegion('Md test')
    // Texto renderizado sin símbolos crudos
    expect(within(region).getByText('Título principal')).toBeInTheDocument()
    expect(within(region).getByText('Texto en negrita')).toBeInTheDocument()
    // No debe haber elementos que contengan '##' o '**' como texto
    expect(within(region).queryByText(/^##/)).not.toBeInTheDocument()
    expect(within(region).queryByText(/\*\*/)).not.toBeInTheDocument()
  })

  // ── CRUD — crear ─────────────────────────────────────────────────────────────

  it('crear tema nuevo (source no duplicado) reindexa con {source, content}', async () => {
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

  it('crear sin tema usa "general" — detecta duplicado y pide confirmación antes de reindexar', async () => {
    render(<KnowledgeBaseManager />)
    fireEvent.change(screen.getByLabelText('Contenido'), {
      target: { value: 'Sin tema' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tema' }))

    // No llama a reindex todavía — espera confirmación
    expect(reindexMutate).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByText(/Ya existe un tema/)).toBeInTheDocument(),
    )

    // Confirmar reemplazo → llama a reindex con source correcto
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reemplazar' }))
    await waitFor(() => expect(reindexMutate).toHaveBeenCalled())
    expect(reindexMutate.mock.calls[0][0]).toEqual({
      source: 'general',
      content: 'Sin tema',
    })
  })

  // ── Red de seguridad — reemplazo ──────────────────────────────────────────────

  it('red de seguridad — detecta source duplicado y muestra alertdialog', async () => {
    render(<KnowledgeBaseManager />)
    fireEvent.change(screen.getByLabelText('Contenido'), {
      target: { value: 'Contenido nuevo' },
    })
    fireEvent.change(screen.getByLabelText('Tema (opcional)'), {
      target: { value: 'obras-sociales' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tema' }))

    expect(reindexMutate).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByRole('alertdialog')).toBeInTheDocument(),
    )
    // Muestra el nombre legible del topic duplicado
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/Obras sociales/)).toBeInTheDocument()
  })

  it('red de seguridad — cancelar cierra el diálogo sin reindexar', async () => {
    render(<KnowledgeBaseManager />)
    fireEvent.change(screen.getByLabelText('Contenido'), {
      target: { value: 'Contenido nuevo' },
    })
    fireEvent.change(screen.getByLabelText('Tema (opcional)'), {
      target: { value: 'obras-sociales' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tema' }))

    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument())

    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(reindexMutate).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  // ── CRUD — editar ─────────────────────────────────────────────────────────────

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

  it('editar — Cancelar descarta los cambios', () => {
    render(<KnowledgeBaseManager />)
    const row = topicRow('OSDE se acepta')
    fireEvent.click(within(row).getByText('Editar'))
    expect(screen.getByLabelText('Editar contenido del tema')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.queryByLabelText('Editar contenido del tema')).not.toBeInTheDocument()
    expect(reindexMutate).not.toHaveBeenCalled()
  })

  // ── CRUD — borrar ─────────────────────────────────────────────────────────────

  it('borrar tema confirma en 2 pasos y llama useDeleteTopic con el source', async () => {
    render(<KnowledgeBaseManager />)
    const row = topicRow('OSDE se acepta')
    fireEvent.click(within(row).getByText('Borrar'))
    // Aún no se borró: aparece el paso de confirmación
    expect(deleteMutate).not.toHaveBeenCalled()
    expect(within(row).getByText('Confirmar borrado')).toBeInTheDocument()

    fireEvent.click(within(row).getByText('Confirmar borrado'))
    await waitFor(() => expect(deleteMutate).toHaveBeenCalled())
    expect(deleteMutate.mock.calls[0][0]).toBe('obras-sociales')
  })

  // ── Gating canEdit ────────────────────────────────────────────────────────────

  it('oculta acciones de escritura para doctor (canEdit=false)', () => {
    render(<KnowledgeBaseManager canEdit={false} />)
    // Formulario de creación oculto
    expect(screen.queryByText('Agregar tema')).not.toBeInTheDocument()
    // Botones de editar/borrar ocultos
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    expect(screen.queryByText('Borrar')).not.toBeInTheDocument()
    // Pero sí muestra lista con nombre legible y resumen (lectura)
    expect(screen.getByText('Obras sociales')).toBeInTheDocument()
    expect(screen.getByText('OSDE se acepta')).toBeInTheDocument()
  })

  it('canEdit=false — el acordeón funciona en modo lectura', () => {
    render(<KnowledgeBaseManager canEdit={false} />)
    const btn = toggleBtn('Obras sociales')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(accordionRegion('Obras sociales')).toBeInTheDocument()
  })
})
