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

  // ── Sin autosave: el guardado es SOLO por botón ────────────────────────────
  // El autosave con debounce creaba una nota nueva (POST) por cada pausa al
  // escribir. Estos tests son la red que impide que vuelva a introducirse.

  it('NO guarda solo: escribir y esperar no dispara ningún fetch', async () => {
    vi.useFakeTimers()

    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    act(() => {
      fireEvent.change(textarea, { target: { value: 'Texto de prueba' } })
    })

    // Muy por encima del viejo debounce de 1200ms
    await act(async () => {
      vi.advanceTimersByTime(10_000)
      await Promise.resolve()
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('NO guarda solo: tipeo incremental con pausas no crea una nota por pausa', async () => {
    vi.useFakeTimers()

    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    // Reproduce el bug reportado: "disco" → "discopatia" → "discopatia lumbar"
    for (const parcial of ['disco', 'discopatia', 'discopatia lumbar']) {
      act(() => {
        fireEvent.change(textarea, { target: { value: parcial } })
      })
      await act(async () => {
        vi.advanceTimersByTime(2000)
        await Promise.resolve()
      })
    }

    expect(fetch).not.toHaveBeenCalled()

    // Recién el click guarda, y guarda UNA sola vez con el texto completo
    const guardar = screen.getByRole('button', { name: /guardar nota/i })
    await act(async () => {
      fireEvent.click(guardar)
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      '/api/patients/p1/clinical-notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'discopatia lumbar' }),
      })
    )
  })

  it('botón "Guardar nota" hace POST cuando no hay noteId', async () => {
    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    fireEvent.change(textarea, { target: { value: 'Nota urgente' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar nota/i }))
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      '/api/patients/p1/clinical-notes',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('tras guardar una nota nueva, vacía el textarea (no permite re-POST del mismo texto)', async () => {
    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    fireEvent.change(textarea, { target: { value: 'Nota de consulta' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar nota/i }))
      await Promise.resolve()
    })

    expect((textarea as HTMLTextAreaElement).value).toBe('')
    // Y el botón vuelve a estar deshabilitado: un segundo click no duplica
    expect(screen.getByRole('button', { name: /guardar nota/i })).toBeDisabled()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('al editar una nota existente NO vacía el textarea', async () => {
    render(<ClinicalNoteEditor patientId="p1" noteId="n1" initialContent="Original" />)
    const textarea = screen.getByLabelText('Nota clínica')

    fireEvent.change(textarea, { target: { value: 'Editado' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar nota/i }))
      await Promise.resolve()
    })

    expect((textarea as HTMLTextAreaElement).value).toBe('Editado')
  })

  it('doble click rápido en "Guardar nota" hace un solo POST', async () => {
    render(<ClinicalNoteEditor patientId="p1" />)
    const textarea = screen.getByLabelText('Nota clínica')

    fireEvent.change(textarea, { target: { value: 'Nota con doble click' } })

    const guardar = screen.getByRole('button', { name: /guardar nota/i })

    await act(async () => {
      fireEvent.click(guardar)
      fireEvent.click(guardar)
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledOnce()
  })

  it('no muestra el texto "Se guarda automáticamente"', () => {
    render(<ClinicalNoteEditor patientId="p1" />)
    expect(screen.queryByText(/se guarda autom/i)).not.toBeInTheDocument()
  })

  it('al escribir muestra "Cambios sin guardar"', () => {
    render(<ClinicalNoteEditor patientId="p1" />)
    fireEvent.change(screen.getByLabelText('Nota clínica'), { target: { value: 'algo' } })
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument()
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
