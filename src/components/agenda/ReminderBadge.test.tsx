import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ReminderBadge } from './ReminderBadge'

describe('ReminderBadge', () => {
  it("estado 'none': reminder_sent_at null y sin confirmar → no renderiza nada (AC4)", () => {
    const { container } = render(
      <ReminderBadge reminderSentAt={null} attendanceConfirmed={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("estado 'none' también cuando attendance_confirmed=false y reminder null", () => {
    const { container } = render(
      <ReminderBadge reminderSentAt={null} attendanceConfirmed={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("estado 'confirmed': attendance_confirmed=true → 'Confirmado por el paciente' (AC2)", () => {
    render(
      <ReminderBadge
        reminderSentAt="2026-06-14T12:00:00.000Z"
        attendanceConfirmed={true}
      />,
    )
    expect(screen.getByText(/Confirmado por el paciente/)).toBeInTheDocument()
  })

  it("estado 'confirmed' aun si reminder_sent_at es null (AC2 independiente)", () => {
    render(<ReminderBadge reminderSentAt={null} attendanceConfirmed={true} />)
    const badge = screen.getByLabelText(/Estado de recordatorio: Confirmado por el paciente/)
    expect(badge).toBeInTheDocument()
  })

  it("estado 'unconfirmed': reminder enviado y NO confirmado → 'Sin confirmar' + hora (AC1/AC3)", () => {
    render(
      <ReminderBadge
        reminderSentAt="2026-06-14T12:00:00.000Z"
        attendanceConfirmed={false}
      />,
    )
    // Label de estado
    expect(screen.getByText(/Sin confirmar/)).toBeInTheDocument()
    // aria-label incluye "enviado" con la fecha formateada (AC6)
    expect(
      screen.getByLabelText(/Estado de recordatorio: Sin confirmar, enviado/),
    ).toBeInTheDocument()
  })

  it("estado 'unconfirmed' con attendance_confirmed null → también 'Sin confirmar' (AC3)", () => {
    render(
      <ReminderBadge
        reminderSentAt="2026-06-14T12:00:00.000Z"
        attendanceConfirmed={null}
      />,
    )
    expect(screen.getByText(/Sin confirmar/)).toBeInTheDocument()
  })

  it('null-safety: fecha inválida no produce "Invalid Date" en pantalla (AC6)', () => {
    render(
      <ReminderBadge reminderSentAt="no-es-fecha" attendanceConfirmed={false} />,
    )
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
    // Sigue mostrando el label de estado aunque la fecha sea inválida
    expect(screen.getByText(/Sin confirmar/)).toBeInTheDocument()
  })

  it('null-safety: nunca renderiza los strings "null" ni "undefined"', () => {
    render(<ReminderBadge reminderSentAt={null} attendanceConfirmed={true} />)
    expect(screen.queryByText(/null/)).not.toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
  })
})
