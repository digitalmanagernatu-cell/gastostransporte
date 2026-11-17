// Lectura de los Excel de facturación (SAP) y de las facturas de cada agencia.
// Los lectores por agencia son un port del nodo "Preparar archivo" del flujo n8n.
import * as XLSX from 'xlsx'
import type { BillingRowInput, InvoiceLineInput } from './api'

export type Cell = string | number | boolean | null
export type Grid = Cell[][]

export async function readGrid(file: File): Promise<Grid> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('El archivo no tiene hojas')
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '', blankrows: false })
}

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
const lower = (v: unknown) => s(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Importe en formato numérico o texto español ("1.234,56 €"). */
export function parseAmount(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let t = s(v).replace(/[€\s]/g, '')
  if (!t) return 0
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round(n * 100) / 100

// ─────────────────────────────────────────────────────────────────────────────
// FACTURACIÓN SAP
// ─────────────────────────────────────────────────────────────────────────────

export type SapField = 'invoice_number' | 'client_code' | 'client_name' | 'comercial' | 'grupo' | 'base_imponible' | 'num_facturas'

export const SAP_FIELDS: { key: SapField; label: string; required: boolean }[] = [
  { key: 'client_code', label: 'Código cliente', required: true },
  { key: 'client_name', label: 'Nombre cliente', required: false },
  { key: 'comercial', label: 'Comercial', required: true },
  { key: 'grupo', label: 'Grupo', required: false },
  { key: 'base_imponible', label: 'Ventas / base imponible', required: true },
  { key: 'num_facturas', label: 'Nº facturas', required: false },
  { key: 'invoice_number', label: 'Nº factura (si es por factura)', required: false },
]

// ─── Línea de negocio ────────────────────────────────────────────────────────
// Igual que en el flujo n8n: la línea sale del código del comercial
// (FAR → FARMACIA, NT → NATU GRANEL, NTGC → GRAN CONSUMO, NTMP → NATU WEB, VF → VINTAGE).
// Excepción: los clientes del grupo «MUESTRAS…» van a su propia línea MUESTRAS.

export const LINEAS = ['FARMACIA', 'NATU GRANEL', 'GRAN CONSUMO', 'NATU WEB', 'VINTAGE', 'MUESTRAS', 'SIN COMERCIAL'] as const

/** "INACTIVO NT01.1. JAIME GRAN CTA" → { code: 'NT01.1', name: 'JAIME GRAN CTA (inactivo)' } */
export function splitComercial(raw: unknown): { code: string; name: string } {
  let t = s(raw)
  const inactivo = /^INACTIVO\s+/i.test(t)
  t = t.replace(/^INACTIVO\s+/i, '')
  const m = t.match(/^([A-Z]+\d+(?:\.\d+)?)\.?\s*(.*)$/i)
  if (!m) return { code: '', name: '' } // «-Ningún empleado dep.ventas-» o vacío
  const name = (m[2] || m[1]).replace(/[.\s]+$/, '').trim()
  return { code: m[1].toUpperCase(), name: inactivo ? `${name} (inactivo)` : name }
}

const LINEA_EXCEPCIONES: Record<string, string> = {
  NT09: 'VINTAGE', // NATUAROMATIC VINTAGE
}

export function lineaNegocio(comercialCode: string, grupo: unknown): string {
  if (/MUESTRA/i.test(s(grupo))) return 'MUESTRAS'
  const k = comercialCode.toUpperCase()
  if (!k) return 'SIN COMERCIAL'
  if (LINEA_EXCEPCIONES[k]) return LINEA_EXCEPCIONES[k]
  if (/^FAR/.test(k)) return 'FARMACIA'
  if (/^NTGC/.test(k)) return 'GRAN CONSUMO'
  if (/^NTMP/.test(k)) return 'NATU WEB'
  if (/^VFI?\d/.test(k)) return 'VINTAGE'
  if (/^NT\d/.test(k)) return 'NATU GRANEL'
  return 'SIN COMERCIAL'
}

/** Detecta "Ventas septiembre 2026" en la cabecera para proponer mes y año. */
export function detectPeriod(headers: string[]): { year: number; month: number } | null {
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  for (const h of headers) {
    const t = lower(h)
    const i = MESES.findIndex(m => t.includes(m) || (m === 'septiembre' && t.includes('setiembre')))
    const y = t.match(/(20\d{2})/)
    if (i >= 0 && y) return { year: +y[1], month: i + 1 }
  }
  return null
}

const SAP_PATTERNS: Record<SapField, RegExp[]> = {
  client_code: [/^(cod|codigo|cod\.)\s*(de\s*)?cliente/, /^cliente\s*(cod|codigo)/, /^n[ºo°]?\s*cliente/, /^cardcode$/, /^cliente$/],
  client_name: [/^nombre\s*(de\s*)?cliente/, /^razon social/, /^nombre$/, /^cardname$/, /cliente.*nombre/, /^cliente$/],
  comercial: [/comercial/, /vendedor/, /empleado/, /agente/, /^slpname$/],
  grupo: [/^grupo/, /grupo/, /tipo\s*cliente/],
  base_imponible: [/^ventas/, /base\s*imponible/, /^base$/, /importe\s*neto/, /^neto$/, /total\s*sin\s*iva/, /^importe$/],
  num_facturas: [/n[ºo°]?\s*(de\s*)?facturas$/, /num.*facturas/, /^facturas$/],
  invoice_number: [/^n[ºo°]?\s*(de\s*)?factura$/, /^factura$/, /^num.*factura$/, /^docnum$/, /^n[ºo°]?\s*doc/],
}

export interface SapLayout {
  headerRow: number
  headers: string[]
  mapping: Record<SapField, number> // índice de columna, -1 = no asignado
}

/** Busca la fila de cabecera y adivina qué columna es cada campo. */
export function detectSapLayout(grid: Grid): SapLayout {
  let best = { row: 0, score: -1, mapping: {} as Record<SapField, number> }
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const cells = grid[r].map(lower)
    const mapping = {} as Record<SapField, number>
    let score = 0
    for (const f of SAP_FIELDS) {
      let idx = -1
      for (const re of SAP_PATTERNS[f.key]) {
        idx = cells.findIndex((c, i) => c && re.test(c) && !Object.values(mapping).includes(i))
        if (idx >= 0) break
      }
      mapping[f.key] = idx
      if (idx >= 0) score++
    }
    if (score > best.score) best = { row: r, score, mapping }
  }
  // Sin cabeceras reconocibles → orden del Excel SAP del flujo n8n (A factura, B código, C nombre, D comercial, E base)
  if (best.score < 2) {
    best = {
      row: 0, score: 0,
      mapping: { invoice_number: 0, client_code: 1, client_name: 2, comercial: 3, grupo: -1, base_imponible: 4, num_facturas: -1 },
    }
  }
  const width = Math.max(...grid.slice(0, 50).map(r => r.length), 0)
  const headers = Array.from({ length: width }, (_, i) => s(grid[best.row]?.[i]) || `Columna ${XLSX.utils.encode_col(i)}`)
  return { headerRow: best.row, headers, mapping: best.mapping }
}

export function parseSap(grid: Grid, layout: SapLayout): BillingRowInput[] {
  const m = layout.mapping
  const get = (row: Cell[], f: SapField) => (m[f] >= 0 ? row[m[f]] : '')
  const out: BillingRowInput[] = []
  for (const row of grid.slice(layout.headerRow + 1)) {
    const code = s(get(row, 'client_code')).toUpperCase()
    if (!code) continue
    const lc = code.toLowerCase()
    if (lc.startsWith('total') || lc.includes('sin asignar')) continue
    const com = splitComercial(get(row, 'comercial'))
    const perInvoice = m.invoice_number >= 0
    out.push({
      invoice_number: s(get(row, 'invoice_number')).toUpperCase(),
      client_code: code,
      client_name: s(get(row, 'client_name')),
      comercial: com.name || 'SIN COMERCIAL',
      linea_negocio: lineaNegocio(com.code, get(row, 'grupo')),
      base_imponible: round2(parseAmount(get(row, 'base_imponible'))),
      // Excel por cliente: nº facturas de su columna. Excel por factura: 1 por fila.
      num_facturas: m.num_facturas >= 0 ? Math.trunc(parseAmount(get(row, 'num_facturas'))) : perInvoice ? 1 : 0,
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTURAS DE AGENCIAS
// ─────────────────────────────────────────────────────────────────────────────

export const AGENCY_NAMES = ['DHL_EXPORT', 'DHL', 'SEUR', 'PALEMANIA', 'TRANSAHER', 'REDUR', 'NACEX', 'CORREOS']

/** Agencia que sugiere el nombre del archivo (DHL_EXPORT antes que DHL). */
export function agencyFromFilename(name: string): string | null {
  const up = name.toUpperCase().replace(/[\s-]+/g, '_')
  if (/DHL_?EXPORT|DHL_?EXP/.test(up)) return 'DHL_EXPORT'
  return AGENCY_NAMES.find(a => up.includes(a)) ?? null
}

type Row = Record<string, Cell>

/** Convierte la cuadrícula en objetos usando como cabecera la primera fila que contenga alguna de las columnas esperadas. */
function toObjects(grid: Grid, expected: string[]): Row[] {
  const exp = expected.map(lower)
  let headerRow = 0
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const cells = grid[r].map(lower)
    if (exp.some(e => cells.includes(e))) { headerRow = r; break }
  }
  const headers = grid[headerRow]?.map(h => s(h)) ?? []
  return grid.slice(headerRow + 1).map(row => {
    const o: Row = {}
    headers.forEach((h, i) => { if (h) o[h] = row[i] ?? '' })
    return o
  })
}

/** Valor por nombre de columna, sin distinguir mayúsculas ni tildes. */
function col(row: Row, ...names: string[]): Cell {
  const wanted = names.map(lower)
  for (const [k, v] of Object.entries(row)) if (wanted.includes(lower(k))) return v
  return ''
}

const CLIENT_RE = /^CF?\d{3,}$/i
const DOC_RE = /^(FV|PV)\d{4,}$/i

/** Referencia → código cliente (C123/CF123) o nº de factura SAP (FV/PV + número, sin prefijo). */
function cleanRef(raw: unknown, allowBareNumber = false): string {
  const r = s(raw).toUpperCase()
  if (!r) return ''
  if (CLIENT_RE.test(r)) return r
  if (DOC_RE.test(r)) return r.replace(/^(FV|PV)/i, '')
  if (allowBareNumber && /^\d{6,}$/.test(r)) return r
  return ''
}

export interface ParsedInvoice {
  lines: InvoiceLineInput[]
  invoiceNumbers: string[]
}

function finish(lines: InvoiceLineInput[]): ParsedInvoice {
  const nums = [...new Set(lines.map(l => l.agency_invoice).filter(Boolean))]
  return { lines: lines.filter(l => l.amount !== 0).map(l => ({ ...l, amount: round2(l.amount) })), invoiceNumbers: nums }
}

const line = (ref: string, original: string, invoice: string, amount: number): InvoiceLineInput =>
  ({ client_code: ref, reference: ref, reference_original: original, agency_invoice: invoice, amount })

function parseSeur(grid: Grid): ParsedInvoice {
  const rows = toObjects(grid, ['Referencia', 'Importe facturado (sin impuestos)'])
  return finish(rows.flatMap(r => {
    const raw = s(col(r, 'Referencia')).toUpperCase()
    const imp = parseAmount(col(r, 'Importe facturado (sin impuestos)'))
    return imp > 0 ? [line(cleanRef(raw), raw, s(col(r, 'Numero Factura', 'Número Factura')), imp)] : []
  }))
}

function parseDhl(grid: Grid): ParsedInvoice {
  const rows = toObjects(grid, ['Referencia 1', 'Total Neto'])
  return finish(rows.flatMap(r => {
    const raw = s(col(r, 'Referencia 1')).toUpperCase()
    const imp = parseAmount(col(r, 'Total Neto'))
    if (imp <= 0) return []
    const ref = CLIENT_RE.test(raw) ? raw : ''
    return [line(ref, raw || s(col(r, 'Nombre del producto')), s(col(r, 'Número de factura', 'Numero de factura')), imp)]
  }))
}

function parseCorreos(grid: Grid): ParsedInvoice {
  const rows = toObjects(grid, ['REFERENCIA', 'IMP. TOTAL', 'Nº ENVIO'])
  return finish(rows.flatMap(r => {
    const raw = s(col(r, 'REFERENCIA')).toUpperCase()
    const imp = parseAmount(col(r, 'IMP. TOTAL'))
    return imp > 0 ? [line(cleanRef(raw), raw, s(col(r, 'Nº ENVIO')), imp)] : []
  }))
}

function parsePalemania(grid: Grid): ParsedInvoice {
  const rows = toObjects(grid, ['dc_price', 'c_cusref'])
  return finish(rows.flatMap(r => {
    const imp = parseAmount(col(r, 'dc_price'))
    const cusref = s(col(r, 'c_cusref')).toUpperCase()
    const carcon = s(col(r, 'c_carcon')).toUpperCase()
    const ref = CLIENT_RE.test(cusref) ? cusref : CLIENT_RE.test(carcon) ? carcon : (cusref || carcon)
    return imp > 0 && ref ? [line(ref, cusref || carcon, s(col(r, 'dc_syscon')), imp)] : []
  }))
}

function parseTransaher(grid: Grid): ParsedInvoice {
  const rows = toObjects(grid, ['Importe', 'Albarán Ordenante', 'Albarán Ordenate', 'Albarán Remitente'])
  // Agrupa por envío (albarán ordenante + remitente) como en n8n
  const envios = new Map<string, { o: string; p: string; imp: number; fact: string }>()
  for (const r of rows) {
    const o = s(col(r, 'Albarán Ordenate', 'Albarán Ordenante', 'Albaran Ordenate', 'Albaran Ordenante'))
    const p = s(col(r, 'Albarán Remitente', 'Albaran Remitente'))
    const fact = s(col(r, 'Número de factura', 'Numero de factura', 'Nº Factura', 'N Factura'))
    const k = `${o}||${p}`
    const e = envios.get(k) ?? { o, p, imp: 0, fact }
    e.imp += parseAmount(col(r, 'Importe'))
    if (fact) e.fact = fact
    envios.set(k, e)
  }
  return finish([...envios.values()].flatMap(e => {
    if (e.imp <= 0) return []
    const ref = cleanRef(e.o, true) || cleanRef(e.p, true)
    return [line(ref, e.o || e.p, e.fact, e.imp)]
  }))
}

/** Lector genérico (REDUR, NACEX y cualquier formato no reconocido). */
function parseGeneric(grid: Grid): ParsedInvoice {
  const HEADER_KW = ['referencia', 'importe', 'cliente', 'fecha', 'total', 'expedicion', 'bultos', 'destinatario']
  let headerRow = -1
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    if (grid[r].map(lower).filter(c => HEADER_KW.includes(c)).length >= 2) { headerRow = r; break }
  }
  const headers = headerRow >= 0 ? grid[headerRow].map(lower) : []
  const findIdx = (cands: string[]) => {
    for (const c of cands) {
      const i = headers.findIndex(h => h === c || h.includes(c))
      if (i >= 0) return i
    }
    return -1
  }
  const refIdx = findIdx(['referencia'])
  const amtIdx = findIdx(['importe', 'total', 'base imponible', 'neto', 'coste', 'total factura'])
  const out: InvoiceLineInput[] = []
  for (const row of grid.slice(headerRow + 1)) {
    if (row.every(v => v === '' || v === null)) continue
    if (row.map(lower).filter(c => HEADER_KW.includes(c)).length >= 2) continue
    const imp = Math.abs(parseAmount(amtIdx >= 0 ? row[amtIdx] : ''))
    if (!imp) continue
    const rawRef = refIdx >= 0 ? s(row[refIdx]).toUpperCase() : ''
    let ref = cleanRef(rawRef)
    if (!ref) {
      for (const v of row) { const c = cleanRef(v); if (c && CLIENT_RE.test(s(v))) { ref = c; break } }
    }
    out.push(line(ref, rawRef, '', imp))
  }
  return finish(out)
}

export function parseAgencyInvoice(agency: string, grid: Grid): ParsedInvoice {
  switch (agency) {
    case 'SEUR': return parseSeur(grid)
    case 'DHL':
    case 'DHL_EXPORT': return parseDhl(grid)
    case 'CORREOS': return parseCorreos(grid)
    case 'PALEMANIA': return parsePalemania(grid)
    case 'TRANSAHER': return parseTransaher(grid)
    default: return parseGeneric(grid)
  }
}
