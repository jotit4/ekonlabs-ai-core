import { describe, it, expect } from 'vitest'
import {
  TURNERO_PALETTE,
  HEX_COLOR_REGEX,
  isValidHexColor,
  getReadableTextColor,
} from './turnero-palette'

describe('TURNERO_PALETTE', () => {
  it('tiene EXACTAMENTE los 16 colores del turnero Excel, en orden, sin cambiar un dígito', () => {
    expect(TURNERO_PALETTE).toEqual([
      '#00FFFF',
      '#00FF00',
      '#FFC000',
      '#FFFF00',
      '#B9CDE5',
      '#CCC1DA',
      '#CC00FF',
      '#E6B9B8',
      '#00FF99',
      '#CC00CC',
      '#FDEADA',
      '#FFCC00',
      '#F030D9',
      '#FF66CC',
      '#66FFFF',
      '#FF0000',
    ])
  })

  it('no incluye los colores marginales descartados por el cliente', () => {
    expect(TURNERO_PALETTE).not.toContain('#FAC090')
    expect(TURNERO_PALETTE).not.toContain('#C6D9F1')
    expect(TURNERO_PALETTE).not.toContain('#92D050')
  })

  it('cada color de la paleta es un hex válido según isValidHexColor', () => {
    for (const color of TURNERO_PALETTE) {
      expect(isValidHexColor(color)).toBe(true)
    }
  })
})

describe('isValidHexColor', () => {
  it('acepta hex de 6 dígitos con # (mayúsculas y minúsculas)', () => {
    expect(isValidHexColor('#00FFFF')).toBe(true)
    expect(isValidHexColor('#00ffff')).toBe(true)
    expect(isValidHexColor('#Ab12Cd')).toBe(true)
  })

  it('rechaza valores mal formados', () => {
    expect(isValidHexColor('00FFFF')).toBe(false) // sin #
    expect(isValidHexColor('#00FF')).toBe(false) // 4 dígitos
    expect(isValidHexColor('#00FFFFFF')).toBe(false) // 8 dígitos
    expect(isValidHexColor('#GGGGGG')).toBe(false) // no hex
    expect(isValidHexColor('')).toBe(false)
  })

  it('rechaza valores no-string sin tirar', () => {
    expect(isValidHexColor(null)).toBe(false)
    expect(isValidHexColor(undefined)).toBe(false)
    expect(isValidHexColor(123456)).toBe(false)
    expect(isValidHexColor({})).toBe(false)
  })

  it('el regex exportado coincide con el criterio del CHECK de la migración 051', () => {
    expect(HEX_COLOR_REGEX.source).toBe('^#[0-9A-Fa-f]{6}$')
  })
})

describe('getReadableTextColor', () => {
  it('elige texto OSCURO sobre colores muy brillantes/saturados de la paleta', () => {
    // Cian, verde, amarillo puros, y amarillo-ámbar: todos muy luminosos.
    expect(getReadableTextColor('#00FFFF')).toBe('#141414')
    expect(getReadableTextColor('#00FF00')).toBe('#141414')
    expect(getReadableTextColor('#FFFF00')).toBe('#141414')
    expect(getReadableTextColor('#FFC000')).toBe('#141414')
  })

  it('elige texto CLARO sobre colores oscuros/densos', () => {
    expect(getReadableTextColor('#000000')).toBe('#ffffff')
    expect(getReadableTextColor('#0000FF')).toBe('#ffffff')
  })

  it('rojo puro (#FF0000) resuelve a texto oscuro (mejor contraste que blanco)', () => {
    // Verificación explícita del cruce WCAG: luminancia del rojo (0.2126) queda
    // apenas por encima del umbral (0.179).
    expect(getReadableTextColor('#FF0000')).toBe('#141414')
  })

  it('devuelve siempre un hex sólido (sin opacidad/alpha)', () => {
    for (const color of TURNERO_PALETTE) {
      const text = getReadableTextColor(color)
      expect(text).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('fallback seguro ante un valor inválido (no tira, no devuelve undefined)', () => {
    expect(getReadableTextColor('no-es-un-color')).toBe('#141414')
    expect(getReadableTextColor('')).toBe('#141414')
  })
})
