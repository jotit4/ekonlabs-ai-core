import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import { RegistrarLlegadaModal } from './RegistrarLlegadaModal'

const SERVICE_ID = '407ad166-03ef-4187-be07-064602241edf'
const PROFESSIONAL_ID = 'c686d654-0c61-4ca2-b041-477fae971aad'
const DNI = '41770599'

const onClose = vi.fn()
const onRegistered = vi.fn()

function renderModal() {
  return render(
    <RegistrarLlegadaModal
      open
      onClose={onClose}
      serviceId={SERVICE_ID}
      professionalId={PROFESSIONAL_ID}
      onRegistered={onRegistered}
    />,
  )
}

const jsonRes = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

/** Deja la búsqueda de DNI sin resultados → aparece el form de alta. */
async function buscarDniInexistente(user: ReturnType<typeof userEvent.setup>) {
  mockFetch.mockResolvedValueOnce(jsonRes(200, { patients: [] }))
  await user.type(screen.getByLabelText('DNI del paciente'), DNI)
  await screen.findByLabelText('Cargar paciente nuevo')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RegistrarLlegadaModal — alta de paciente al vuelo (ISADI 2026-07-27)', () => {
  it('con un DNI sin resultados ofrece cargar al paciente en vez de dejar un callejón sin salida', async () => {
    const user = userEvent.setup()
    renderModal()

    await buscarDniInexistente(user)

    expect(screen.getByText(`No hay ningún paciente con DNI ${DNI}`)).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre y apellido')).toBeInTheDocument()
    expect(screen.getByLabelText('Teléfono')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear y anotar en la cola' })).toBeInTheDocument()
  })

  it('crea el paciente y lo anota en la cola en una sola acción', async () => {
    const user = userEvent.setup()
    renderModal()
    await buscarDniInexistente(user)

    mockFetch
      .mockResolvedValueOnce(jsonRes(201, { patient: { patient_id: 'pat-nuevo' } }))
      .mockResolvedValueOnce(jsonRes(201, { appointment: { appointment_id: 'apt-1' } }))

    await user.type(screen.getByLabelText('Nombre y apellido'), 'Nicolás Raytano')
    await user.type(screen.getByLabelText('Teléfono'), '2615551234')
    await user.click(screen.getByRole('button', { name: 'Crear y anotar en la cola' }))

    await waitFor(() => expect(onRegistered).toHaveBeenCalled())

    const [patientsUrl, patientsInit] = mockFetch.mock.calls[1]
    expect(patientsUrl).toBe('/api/patients')
    expect(JSON.parse(patientsInit.body)).toMatchObject({
      full_name: 'Nicolás Raytano',
      phone_number: '2615551234',
      dni: DNI,
    })

    const [walkInUrl, walkInInit] = mockFetch.mock.calls[2]
    expect(walkInUrl).toBe('/api/appointments/walk-in')
    expect(JSON.parse(walkInInit.body)).toEqual({
      patient_id: 'pat-nuevo',
      service_id: SERVICE_ID,
      professional_id: PROFESSIONAL_ID,
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['patients'] })
    expect(onClose).toHaveBeenCalled()
  })

  it('no llama a la API si falta el nombre o el teléfono', async () => {
    const user = userEvent.setup()
    renderModal()
    await buscarDniInexistente(user)

    const llamadasPreviias = mockFetch.mock.calls.length
    await user.type(screen.getByLabelText('Nombre y apellido'), 'A')
    await user.click(screen.getByRole('button', { name: 'Crear y anotar en la cola' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(mockFetch.mock.calls.length).toBe(llamadasPreviias)
    expect(onRegistered).not.toHaveBeenCalled()
  })

  it('muestra el error del backend y no intenta anotar si el alta del paciente falla', async () => {
    const user = userEvent.setup()
    renderModal()
    await buscarDniInexistente(user)

    mockFetch.mockResolvedValueOnce(jsonRes(400, { error: 'Ya existe un paciente con ese DNI' }))

    await user.type(screen.getByLabelText('Nombre y apellido'), 'Nicolás Raytano')
    await user.type(screen.getByLabelText('Teléfono'), '2615551234')
    await user.click(screen.getByRole('button', { name: 'Crear y anotar en la cola' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un paciente con ese DNI')
    // Solo búsqueda + alta fallida: nunca se llamó a walk-in.
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(onRegistered).not.toHaveBeenCalled()
  })

  it('si el paciente se creó pero falla la cola, el reintento NO crea una segunda ficha', async () => {
    const user = userEvent.setup()
    renderModal()
    await buscarDniInexistente(user)

    mockFetch
      .mockResolvedValueOnce(jsonRes(201, { patient: { patient_id: 'pat-nuevo' } }))
      .mockResolvedValueOnce(jsonRes(500, { error: 'No se pudo registrar la llegada.' }))

    await user.type(screen.getByLabelText('Nombre y apellido'), 'Nicolás Raytano')
    await user.type(screen.getByLabelText('Teléfono'), '2615551234')
    await user.click(screen.getByRole('button', { name: 'Crear y anotar en la cola' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar la llegada.')

    // Reintento: debe ir directo a la cola con el id ya creado.
    mockFetch.mockResolvedValueOnce(jsonRes(201, { appointment: { appointment_id: 'apt-1' } }))
    await user.click(screen.getByRole('button', { name: 'Crear y anotar en la cola' }))

    await waitFor(() => expect(onRegistered).toHaveBeenCalled())

    const altasDePaciente = mockFetch.mock.calls.filter(([url]) => url === '/api/patients')
    expect(altasDePaciente).toHaveLength(1)
  })

  it('una búsqueda por nombre sin resultados NO ofrece el alta (falta el DNI)', async () => {
    const user = userEvent.setup()
    renderModal()

    mockFetch.mockResolvedValueOnce(jsonRes(200, { patients: [] }))
    await user.type(screen.getByLabelText('DNI del paciente'), 'Perez{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin resultados para "Perez"')
    expect(screen.queryByLabelText('Cargar paciente nuevo')).not.toBeInTheDocument()
  })

  it('sigue anotando a un paciente existente sin pasar por el alta', async () => {
    const user = userEvent.setup()
    renderModal()

    mockFetch.mockResolvedValueOnce(
      jsonRes(200, {
        patients: [
          {
            patient_id: 'pat-1',
            full_name: 'Ramón Adrián Pérez',
            phone_number: '2615550000',
            obra_social: null,
            deletion_requested_at: null,
          },
        ],
      }),
    )
    await user.type(screen.getByLabelText('DNI del paciente'), DNI)

    await screen.findByText('✓ Ramón Adrián Pérez')
    expect(screen.queryByLabelText('Cargar paciente nuevo')).not.toBeInTheDocument()

    mockFetch.mockResolvedValueOnce(jsonRes(201, { appointment: { appointment_id: 'apt-1' } }))
    await user.click(screen.getByRole('button', { name: 'Anotar en la cola' }))

    await waitFor(() => expect(onRegistered).toHaveBeenCalled())
    const altasDePaciente = mockFetch.mock.calls.filter(([url]) => url === '/api/patients')
    expect(altasDePaciente).toHaveLength(0)
  })
})
