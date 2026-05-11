import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { ClinicalNoteEditor } from './ClinicalNoteEditor'

// ── Datos de prueba ───────────────────────────────────────────────────────────

const mockNote = {
  note_id: 'n1',
  content: 'test',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  author_id: 'u1',
  patient_id: 'p1',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClinicalNoteEditor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ note: mockNote }),
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('renderiza textarea vacía cuando no hay initialContent', () => {
    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')
    expect(textarea).toBeInTheDocument()
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })

  it('renderiza initialContent en el textarea', () => {
    render(<ClinicalNoteEditor patientId="p1" initialContent="Contenido inicial" />)
    const textarea = screen.getByLabelText('Nota clínica')
    expect((textarea as HTMLTextAreaElement).value).toBe('Contenido inicial')
  })

  it('botón "Guardar nota" está deshabilitado cuando textarea está vacía', () => {
    render(<ClinicalNoteEditor patientId="p1" />)
    const guardar = screen.getByRole('button', { name: /guardar nota/i })
    expect(guardar).toBeDisabled()
  })

  it('botón "Guardar nota" se habilita cuando hay contenido', () => {
    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    fireEvent.change(textarea, { target: { value: 'Algo de texto' } })

    const guardar = screen.getByRole('button', { name: /guardar nota/i })
    expect(guardar).not.toBeDisabled()
  })

  it('autosave NO llama fetch antes de 1200ms', () => {
    vi.useFakeTimers()

    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    act(() => {
      fireEvent.change(textarea, { target: { value: 'Texto de prueba' } })
    })

    // Solo avanzar 1199ms — no debe haber llamado fetch aún
    act(() => { vi.advanceTimersByTime(1199) })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('autosave dispara fetch después de 1200ms de debounce', async () => {
    vi.useFakeTimers()

    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    act(() => {
      fireEvent.change(textarea, { target: { value: 'Texto de prueba' } })
    })

    await act(async () => {
      vi.advanceTimersByTime(1200)
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      '/api/patients/p1/clinical-notes',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('autosave con contenido solo espacios NO llama fetch', async () => {
    vi.useFakeTimers()

    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    act(() => {
      fireEvent.change(textarea, { target: { value: '   ' } })
    })

    await act(async () => {
      vi.advanceTimersByTime(1200)
      await Promise.resolve()
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('botón "Guardar nota" llama fetch inmediatamente (sin esperar debounce)', async () => {
    vi.useFakeTimers()

    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    act(() => {
      fireEvent.change(textarea, { target: { value: 'Nota urgente' } })
    })

    const guardar = screen.getByRole('button', { name: /guardar nota/i })

    await act(async () => {
      fireEvent.click(guardar)
      await Promise.resolve()
    })

    // fetch debe haber sido llamado sin esperar los 1200ms
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('en éxito → muestra "Guardado ✓"', async () => {
    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    fireEvent.change(textarea, { target: { value: 'Nota de prueba' } })

    const guardar = screen.getByRole('button', { name: /guardar nota/i })

    await act(async () => {
      fireEvent.click(guardar)
      await Promise.resolve()
    })

    expect(screen.getByText('Guardado ✓')).toBeInTheDocument()
  })

  it('en error de fetch → muestra "Error al guardar" + botón "Reintentar"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Error' }),
      })
    )

    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    fireEvent.change(textarea, { target: { value: 'Nota con error' } })

    const guardar = screen.getByRole('button', { name: /guardar nota/i })

    await act(async () => {
      fireEvent.click(guardar)
      await Promise.resolve()
    })

    expect(screen.getByText('Error al guardar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('botón "Reintentar" vuelve a llamar fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Error' }),
      })
    )

    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    fireEvent.change(textarea, { target: { value: 'Nota con error' } })

    const guardar = screen.getByRole('button', { name: /guardar nota/i })

    await act(async () => {
      fireEvent.click(guardar)
      await Promise.resolve()
    })

    // Ahora hacer click en Reintentar
    const reintentar = screen.getByRole('button', { name: /reintentar/i })

    await act(async () => {
      fireEvent.click(reintentar)
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('usa PATCH cuando noteId está definido', async () => {
    render(
      <ClinicalNoteEditor patientId="p1" noteId="note-uuid-1" initialContent="Contenido original" />
    )
    const textarea = screen.getByLabelText('Nota clínica')

    // Cambiar contenido para que se guarde
    fireEvent.change(textarea, { target: { value: 'Contenido modificado' } })

    const guardar = screen.getByRole('button', { name: /guardar nota/i })

    await act(async () => {
      fireEvent.click(guardar)
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/patients/p1/clinical-notes/note-uuid-1',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('cleanup correcto — desmonta sin errores de setState', () => {
    const { unmount } = render(<ClinicalNoteEditor patientId="p1" />)
    // Simplemente desmontar no debe lanzar errores
    expect(() => unmount()).not.toThrow()
  })
})
