import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NewTurnoModal } from './NewTurnoModal'
import { patientSearchSchema } from '@/lib/schemas/appointment.schema'

// Mock @base-ui/react/dialog
vi.mock('@base-ui/react/dialog', () => ({
  Dialog: {
    Root: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="dialog-root">{children}</div> : null,
    Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Backdrop: ({ className }: { className?: string }) => (
      <div data-testid="dialog-backdrop" className={className} />
    ),
    Popup: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <div role="dialog" aria-modal="true" {...props}>
        {children}
      </div>
    ),
    Title: ({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) => (
      <h2 id={id} className={className}>
        {children}
      </h2>
    ),
    Close: ({
      children,
      onClick,
      className,
    }: {
      children: React.ReactNode
      onClick?: () => void
      className?: string
    }) => (
      <button type="button" onClick={onClick} className={className}>
        {children}
      </button>
    ),
  },
}))

// Mock @tanstack/react-query
const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

// Mock @refinedev/core
vi.mock('@refinedev/core', () => ({
  useList: () => ({
    data: {
      data: [
        {
          service_id: 'svc-1',
          name: 'Kinesiología',
          professional_name: 'Patricia Pérez',
          duration_minutes: 60,
        },
        {
          service_id: 'svc-2',
          name: 'Fisioterapia',
          professional_name: null,
          duration_minutes: 30,
        },
      ],
    },
  }),
}))

// Mock Supabase browser client
const mockMaybeSingle = vi.fn()
const mockSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })) }))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    from: vi.fn(() => ({ select: mockSelect })),
  }),
}))

const mockOnClose = vi.fn()

describe('NewTurnoModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
  })

  describe('renderizado', () => {
    it('renderiza el campo DNI y botón Buscar cuando open=true', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.getByLabelText('DNI del paciente')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /buscar/i })).toBeInTheDocument()
    })

    it('no renderiza nada cuando open=false', () => {
      render(<NewTurnoModal open={false} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.queryByLabelText('DNI del paciente')).not.toBeInTheDocument()
    })

    it('tiene el título "Nuevo turno"', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.getByText('Nuevo turno')).toBeInTheDocument()
    })

    it('tiene el botón Cancelar', () => {
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    })
  })

  describe('búsqueda de paciente', () => {
    it('muestra datos del paciente tras búsqueda exitosa', async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          patient_id: 'pat-uuid-1',
          full_name: 'Juan García',
          phone_number: '+5491100000000',
          obra_social: 'OSDE',
        },
        error: null,
      })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByLabelText('DNI del paciente'), '12345678')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByText('Juan García')).toBeInTheDocument()
      })
      expect(screen.getByText(/OSDE/)).toBeInTheDocument()
    })

    it('muestra "Sin resultados" cuando no hay coincidencia', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null })

      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByLabelText('DNI del paciente'), '99999999')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByText(/Sin resultados para '99999999'/)).toBeInTheDocument()
      })
    })

    it('muestra error de validación cuando DNI es inválido', async () => {
      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByLabelText('DNI del paciente'), '123') // menos de 7 dígitos
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByText(/Ingresá un DNI válido de 7 u 8 dígitos/)).toBeInTheDocument()
      })
    })
  })

  describe('formulario de turno', () => {
    beforeEach(async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          patient_id: 'pat-uuid-1',
          full_name: 'María López',
          phone_number: '+5491111111111',
          obra_social: null,
        },
        error: null,
      })
    })

    it('muestra el selector de servicio y fecha tras encontrar paciente', async () => {
      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByLabelText('DNI del paciente'), '87654321')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByLabelText('Servicio')).toBeInTheDocument()
        expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
        expect(screen.getByLabelText('Horario')).toBeInTheDocument()
      })
    })

    it('muestra el botón "Guardar turno" tras encontrar paciente', async () => {
      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.type(screen.getByLabelText('DNI del paciente'), '87654321')
      await user.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /guardar turno/i })).toBeInTheDocument()
      })
    })
  })

  describe('botón Cancelar', () => {
    it('llama a onClose cuando se hace click en Cancelar', async () => {
      const user = userEvent.setup()
      render(<NewTurnoModal open={true} onClose={mockOnClose} date="2026-05-08" />)

      await user.click(screen.getByRole('button', { name: /cancelar/i }))
      expect(mockOnClose).toHaveBeenCalledOnce()
    })
  })

  describe('patientSearchSchema', () => {
    it('acepta DNI de 7 dígitos', () => {
      const result = patientSearchSchema.safeParse({ dni: '1234567' })
      expect(result.success).toBe(true)
    })

    it('acepta DNI de 8 dígitos', () => {
      const result = patientSearchSchema.safeParse({ dni: '12345678' })
      expect(result.success).toBe(true)
    })

    it('rechaza DNI de menos de 7 dígitos', () => {
      const result = patientSearchSchema.safeParse({ dni: '123456' })
      expect(result.success).toBe(false)
    })

    it('rechaza DNI de más de 8 dígitos', () => {
      const result = patientSearchSchema.safeParse({ dni: '123456789' })
      expect(result.success).toBe(false)
    })

    it('rechaza DNI con letras', () => {
      const result = patientSearchSchema.safeParse({ dni: '1234567a' })
      expect(result.success).toBe(false)
    })
  })
})
