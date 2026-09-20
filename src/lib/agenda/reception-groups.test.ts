import { describe, it, expect } from 'vitest'
import {
  resolveGroupLabel,
  resolveGroupMainService,
  sortGroupKeys,
  type ReceptionGroupsConfig,
} from './reception-groups'

describe('resolveGroupLabel', () => {
  it('usa la etiqueta configurada cuando existe', () => {
    const groups: ReceptionGroupsConfig = { fisioterapia: { label: 'Fisioterapia', main_service_id: null } }
    expect(resolveGroupLabel('fisioterapia', groups)).toBe('Fisioterapia')
  })

  it('cae a la clave con la primera letra en mayúscula si falta la etiqueta (config sin el grupo)', () => {
    expect(resolveGroupLabel('consultorios', {})).toBe('Consultorios')
  })

  it('cae al fallback si la etiqueta configurada es un string vacío', () => {
    const groups: ReceptionGroupsConfig = { pileta: { label: '   ', main_service_id: null } }
    expect(resolveGroupLabel('pileta', groups)).toBe('Pileta')
  })
})

describe('resolveGroupMainService', () => {
  const fisioterapiaServices = [
    { service_id: 'svc-kine', name: 'Kinesiología' },
    { service_id: 'svc-fisio', name: 'Fisioterapia' },
    { service_id: 'svc-rehab', name: 'Rehabilitación física' },
  ]

  it('usa main_service_id configurado cuando corresponde a un servicio activo del grupo', () => {
    const groups: ReceptionGroupsConfig = {
      fisioterapia: { label: 'Fisioterapia', main_service_id: 'svc-fisio' },
    }
    expect(resolveGroupMainService('fisioterapia', groups, fisioterapiaServices)?.service_id).toBe('svc-fisio')
  })

  it('respaldo por nombre cuando main_service_id no corresponde a ningún servicio activo del grupo', () => {
    const groups: ReceptionGroupsConfig = {
      fisioterapia: { label: 'Fisioterapia', main_service_id: 'svc-inexistente' },
    }
    expect(resolveGroupMainService('fisioterapia', groups, fisioterapiaServices)?.service_id).toBe('svc-fisio')
  })

  it('respaldo por nombre cuando main_service_id es null', () => {
    const groups: ReceptionGroupsConfig = {
      fisioterapia: { label: 'Fisioterapia', main_service_id: null },
    }
    expect(resolveGroupMainService('fisioterapia', groups, fisioterapiaServices)?.service_id).toBe('svc-fisio')
  })

  it('respaldo por nombre sin distinguir mayúsculas ni tildes', () => {
    const groups: ReceptionGroupsConfig = {
      fisioterapia: { label: 'Fisioterapia', main_service_id: null },
    }
    const services = [{ service_id: 'svc-fisio-accent', name: 'FISIOTERAPÍA' }]
    expect(resolveGroupMainService('fisioterapia', groups, services)?.service_id).toBe('svc-fisio-accent')
  })

  it('funciona SIN reception_groups configurado (código publicado antes que la migración): label cae al fallback capitalizado y el respaldo por nombre igual encuentra el servicio', () => {
    expect(resolveGroupMainService('fisioterapia', {}, fisioterapiaServices)?.service_id).toBe('svc-fisio')
  })

  it('retorna undefined si ningún servicio del grupo coincide por id ni por nombre', () => {
    const groups: ReceptionGroupsConfig = { consultorios: { label: 'Consultorios', main_service_id: null } }
    const services = [{ service_id: 'svc-a', name: 'Consulta general' }]
    expect(resolveGroupMainService('consultorios', groups, services)).toBeUndefined()
  })

  it('retorna undefined si el grupo no tiene servicios', () => {
    expect(resolveGroupMainService('fisioterapia', {}, [])).toBeUndefined()
  })
})

describe('resolveGroupMainService — el id configurado gana sobre el respaldo por nombre', () => {
  it('devuelve el servicio de main_service_id aunque OTRO servicio del grupo se llame igual que la etiqueta', () => {
    const groups: ReceptionGroupsConfig = {
      consultorios: { label: 'Consultorios', main_service_id: 'svc-clinica' },
    }
    const services = [
      { service_id: 'svc-homonimo', name: 'Consultorios' },
      { service_id: 'svc-clinica', name: 'Clínica médica' },
    ]
    expect(resolveGroupMainService('consultorios', groups, services)?.service_id).toBe('svc-clinica')
  })
})

describe('sortGroupKeys', () => {
  // Caso real de ISADI: por orden alfabético de servicios, 'pileta' (Aquagym)
  // aparece antes que 'fisioterapia' — el `order` de la cuenta manda.
  it('ordena por `order` aunque el orden de aparición sea otro (ISADI: Fisioterapia/Pileta/Pilates)', () => {
    const groups: ReceptionGroupsConfig = {
      pileta: { label: 'Pileta', main_service_id: null, order: 2 },
      pilates: { label: 'Pilates', main_service_id: null, order: 3 },
      fisioterapia: { label: 'Fisioterapia', main_service_id: null, order: 1 },
    }
    expect(sortGroupKeys(['pileta', 'fisioterapia', 'pilates'], groups)).toEqual([
      'fisioterapia',
      'pileta',
      'pilates',
    ])
  })

  it('sin `order` configurado conserva el orden de aparición', () => {
    expect(sortGroupKeys(['pileta', 'fisioterapia', 'pilates'], {})).toEqual(['pileta', 'fisioterapia', 'pilates'])
  })

  it('los grupos sin `order` van después de los que sí lo tienen, en su orden de aparición', () => {
    const groups: ReceptionGroupsConfig = {
      pilates: { label: 'Pilates', main_service_id: null, order: 1 },
    }
    expect(sortGroupKeys(['pileta', 'fisioterapia', 'pilates'], groups)).toEqual(['pilates', 'pileta', 'fisioterapia'])
  })

  it('no muta el arreglo recibido', () => {
    const keys = ['b', 'a']
    sortGroupKeys(keys, { a: { label: 'A', main_service_id: null, order: 1 } })
    expect(keys).toEqual(['b', 'a'])
  })
})
