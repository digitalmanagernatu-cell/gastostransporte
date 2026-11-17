// Convierte los datos guardados de un mes (facturación SAP + líneas de transporte)
// en las filas que pinta el dashboard. Misma lógica de cruce que el nodo
// "Cruzar y agregar datos" del flujo n8n original:
//   1) la referencia de la línea es un código de cliente de SAP  → ese cliente
//   2) la referencia es un nº de factura/albarán de SAP          → cliente de esa factura
//   3) si no casa                                                 → bloque SIN ASIGNAR
import { AGENCIES } from '../config'
import type { ClientRow, MonthConfig } from '../types'
import type { ApiBillingRow, ApiMonth } from './api'

export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export const norm = (s: unknown) => String(s ?? '').replace(/[\s\-./#]/g, '').toUpperCase()

export function monthLabel(m: { year: number; month: number }) {
  return `${MONTH_NAMES[m.month - 1]} ${m.year}`
}

export function toMonthConfig(m: ApiMonth): MonthConfig {
  return { label: monthLabel(m), sheetName: monthLabel(m).toUpperCase(), gid: String(m.id) }
}

/** Índices para cruzar referencias de transporte con la facturación SAP. */
export function buildMatcher(billing: ApiBillingRow[]) {
  const byClient = new Map<string, string>()
  const byInvoice = new Map<string, string>()
  for (const b of billing) {
    const c = norm(b.client_code)
    if (!c) continue
    byClient.set(c, b.client_code)
    // Nº de factura tal cual y sin prefijo FV/PV (las agencias lo traen de ambas formas)
    const f = norm(b.invoice_number)
    for (const k of [f, f.replace(/^(FV|PV)/, '')]) {
      if (k && !byInvoice.has(k)) byInvoice.set(k, b.client_code)
    }
  }
  return (ref: string | null | undefined): string | null => {
    const k = norm(ref)
    if (!k) return null
    return byClient.get(k) ?? byInvoice.get(k) ?? null
  }
}

const emptyAgencies = () => Object.fromEntries(AGENCIES.map(a => [a, 0])) as Record<string, number>

export function buildMonthRows(m: ApiMonth): ClientRow[] {
  const clients = new Map<string, ClientRow>()
  for (const b of m.billing) {
    const key = b.client_code
    let c = clients.get(key)
    if (!c) {
      c = {
        codigoCliente: b.client_code,
        nombreCliente: b.client_name || b.client_code,
        comercial: b.comercial,
        lineaNegocio: b.linea_negocio,
        baseImponible: 0,
        totalFacturas: 0,
        agencias: emptyAgencies(),
        totalTransporte: 0,
        pctTransporte: 0,
        esSinAsignar: false,
      }
      clients.set(key, c)
    }
    c.baseImponible += b.base_imponible
    c.totalFacturas += b.num_facturas || 0
    if (!c.comercial && b.comercial) c.comercial = b.comercial
    if (!c.lineaNegocio && b.linea_negocio) c.lineaNegocio = b.linea_negocio
  }

  const match = buildMatcher(m.billing)
  const sinAsignar = new Map<string, ClientRow>()

  for (const l of m.lines) {
    // Otros transportistas: gasto general, no se intenta imputar a cliente
    if (l.agency === 'OTROS') {
      const prov = l.reference || 'Otros transportistas'
      const key = `OTROS||${prov}`
      let o = sinAsignar.get(key)
      if (!o) {
        o = {
          codigoCliente: prov,
          nombreCliente: 'Otros transportistas · no imputable',
          comercial: '', lineaNegocio: '', baseImponible: 0, totalFacturas: 0,
          agencias: emptyAgencies(), totalTransporte: 0, pctTransporte: 0,
          esSinAsignar: true, esNoImputable: true,
        }
        sinAsignar.set(key, o)
      }
      o.agencias.OTROS += l.amount
      continue
    }
    const clientCode = match(l.client_code) ?? match(l.reference)
    const client = clientCode ? clients.get(clientCode) : undefined
    if (client) {
      client.agencias[l.agency] = (client.agencias[l.agency] ?? 0) + l.amount
      continue
    }
    const ref = l.reference_original || l.reference || l.client_code || ''
    const key = `${l.agency}||${ref}`
    let u = sinAsignar.get(key)
    if (!u) {
      u = {
        codigoCliente: ref || '(sin referencia)',
        nombreCliente: ref ? '(sin coincidencia)' : '(sin referencia)',
        comercial: '',
        lineaNegocio: '',
        baseImponible: 0,
        totalFacturas: 0,
        agencias: emptyAgencies(),
        totalTransporte: 0,
        pctTransporte: 0,
        esSinAsignar: true,
      }
      sinAsignar.set(key, u)
    }
    u.agencias[l.agency] = (u.agencias[l.agency] ?? 0) + l.amount
  }

  const all = [...clients.values(), ...sinAsignar.values()]
  for (const r of all) {
    r.baseImponible = Math.round(r.baseImponible * 100) / 100
    for (const a of AGENCIES) r.agencias[a] = Math.round((r.agencias[a] ?? 0) * 100) / 100
    r.totalTransporte = Math.round(AGENCIES.reduce((s, a) => s + r.agencias[a], 0) * 100) / 100
    // Cliente con transporte pero sin ventas ese mes → 100 % (sale en alertas)
    r.pctTransporte = r.baseImponible > 0
      ? r.totalTransporte / r.baseImponible
      : (r.totalTransporte > 0 && !r.esSinAsignar ? 1 : 0)
  }
  // El Excel SAP trae toda la cartera: solo se muestran los clientes con actividad ese mes
  return all.filter(r => r.esSinAsignar || r.baseImponible !== 0 || r.totalFacturas > 0 || r.totalTransporte !== 0)
}
