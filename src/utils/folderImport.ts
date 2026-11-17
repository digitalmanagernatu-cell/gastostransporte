// Importación de una carpeta de facturas de transporte (SharePoint).
// Clasifica cada archivo, lee Excel y PDF, detecta duplicados y propone qué cargar.
// Reglas derivadas de la carga manual de septiembre 2026:
//  · Si una factura está en Excel (subcarpeta XLS) y en PDF, se usa el Excel (detalle por cliente).
//  · REDUR (Lozano) y Palemanía cobran un recargo de combustible que no está en el detalle:
//    se reparte proporcionalmente entre los envíos para que el total cuadre con la factura.
//  · Los documentos de aduanas (DUA, BL, CI) no son facturas y se descartan.
//  · Las facturas de proveedores sin desglose van a «Otros transportistas» con su base imponible.
import type { ApiBillingRow, ApiInvoice, InvoiceLineInput } from './api'
import { buildMatcher, norm } from './buildMonth'
import { agencyFromFilename, parseAgencyInvoice, parseAmount, type Grid } from './parsers'
import type { PdfDoc, PdfLine } from './pdfText'

export interface FolderFile { path: string; name: string; size: number; modified: string }

export type Action = 'cargar' | 'descartar' | 'revisar'

export interface Proposal {
  file: FolderFile
  kind: 'excel' | 'pdf' | 'otro'
  agency: string            // clave de agencia, 'OTROS' o '' si no se sabe
  action: Action
  reason: string
  invoiceNumber: string
  supplier: string          // para OTROS: nombre del proveedor
  lines: InvoiceLineInput[] // líneas a guardar (para OTROS se generan al cargar)
  amount: number | null     // importe sin IVA (OTROS) o total de las líneas
  scanned: boolean
  notes: string[]
  keys: string[]            // números identificativos para detectar duplicados
  fuel?: number             // recargo de combustible detectado en el PDF
}

const r2 = (n: number) => Math.round(n * 100) / 100
const CLIENT_RE = /^CF?\d{3,}$/i
const NUM = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/ // importe en formato español

const ext = (n: string) => (n.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
const isCustomsDoc = (name: string) => /^(DUA|BL|CI)\b|\bDUA\b|^CI\s*-/i.test(name.replace(/\.[^.]+$/, ''))

/** Números identificativos del nombre del archivo (para emparejar PDF ↔ Excel). */
function keysFromName(name: string): string[] {
  const base = name.replace(/\.[^.]+$/, '').toUpperCase()
  const out = new Set<string>()
  for (const m of base.matchAll(/[A-Z]*\d[A-Z0-9]{4,}/g)) out.add(m[0])
  for (const m of base.matchAll(/\d{5,}/g)) { out.add(m[0]); out.add(m[0].replace(/^0+/, '')) }
  const fact = base.match(/FACT_(\d+)_(\d+)/)
  if (fact) out.add(fact[2])
  return [...out].filter(k => k.length >= 5)
}

function invoiceFromName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').toUpperCase()
  const f = base.match(/FACT_(\d+)_(\d+)/); if (f) return `${f[1]}/${f[2]}`
  const fra = base.match(/FRA\.?\s+([A-Z]?\d{2}-\d+)/); if (fra) return fra[1]
  const m = base.match(/\b(F\d{9}|MUR\d{2}A\d{6}|XXAR\d{9}|S\d{8})\b/); if (m) return m[1]
  const t = base.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '').match(/[A-Z]*\d[A-Z0-9.\-]{4,}/); return t ? t[0] : ''
}

function invoiceFromText(text: string): string {
  const serie = text.match(/Serie\s*\/\s*N[ºo°]\s*Factura:?\s*(\d+)\s*\/\s*(\d+)/i)
  if (serie) return `${serie[1]}/${serie[2]}`
  const m = text.match(/(?:N[ºo°]\.?\s*(?:de\s*)?Factura|N[úu]mero de Factura|FACTURA\s*N\.?\s*[ºo°])\s*:?\s*([A-Z0-9\-/.]*\d[A-Z0-9\-/.]*)/i)
  if (m) return m[1].replace(/\.$/, '')
  const f = text.match(/\bFactura\s+([A-Z]?\d{6,})\b/)
  return f ? f[1] : ''
}

/** Proveedor legible a partir del nombre del archivo. */
function supplierFromName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\b[A-Z]*\d[\w.\-]*\b/g, '').replace(/\s+/g, ' ').trim() || name
}

/** Base imponible de una factura sin desglose (proveedores varios). */
function detectBase(doc: PdfDoc): { amount: number | null; how: string } {
  const t = doc.text
  const pick = (re: RegExp) => { const m = t.match(re); return m ? parseAmount(m[1]) : null }
  let v = pick(new RegExp(`Base\\s*Imponible\\s*:?\\s*(${NUM.source})\\s*€`, 'i'))
  if (v !== null) return { amount: v, how: 'base imponible' }
  v = pick(new RegExp(`SUBTOTAL[\\s.]*(${NUM.source})`, 'i'))
  if (v !== null) return { amount: v, how: 'subtotal' }
  const en = t.match(/TOTAL\s+(-?[\d,]+\.\d{2})\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+EUR/)
  if (en) return { amount: parseFloat(en[1].replace(/,/g, '')), how: 'neto' }
  v = pick(new RegExp(`Subtotal\\s*(${NUM.source})`, 'i'))
  if (v !== null) return { amount: v, how: 'subtotal' }
  v = pick(new RegExp(`Total\\s*\\(Impuestos Excl\\.?\\)[\\s\\S]{0,80}?(\\d+\\.\\d{2})`, 'i'))
  if (v !== null) return { amount: v, how: 'total sin impuestos' }
  v = pick(new RegExp(`TOTAL\\s*(?:FACTURA|EUROS)[^\\d-]*(${NUM.source})`, 'i'))
  if (v !== null) return { amount: v, how: 'TOTAL con impuestos: revisa' }
  return { amount: null, how: '' }
}

const L = (ref: string, orig: string, inv: string, amount: number): InvoiceLineInput =>
  ({ client_code: ref, reference: ref, reference_original: orig, agency_invoice: inv, amount })

const cleanRef = (raw: string) => {
  const r = raw.trim().toUpperCase()
  if (CLIENT_RE.test(r)) return r
  if (/^CF?\d{3,}[A-Z]$/.test(r)) return r.slice(0, -1)
  if (/^(FV|PV)\d{4,}$/.test(r)) return r.replace(/^(FV|PV)/, '')
  return ''
}

/** Reparte un recargo para que el total de las líneas sea `target`. */
export function prorate(lines: InvoiceLineInput[], target: number): InvoiceLineInput[] {
  const sum = lines.reduce((s, l) => s + l.amount, 0)
  if (!sum) return lines
  const out = lines.map(l => ({ ...l, amount: r2(l.amount * (target / sum)) }))
  const diff = r2(target - out.reduce((s, l) => s + l.amount, 0))
  if (diff !== 0) { const big = out.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a)); big.amount = r2(big.amount + diff) }
  return out
}

const lastAmount = (l: PdfLine) => { const m = l.text.match(new RegExp(`(${NUM.source})\\s*(?:E|€)?\\s*$`)); return m ? parseAmount(m[1]) : null }

function fuelFromPdf(doc: PdfDoc): number {
  const l = doc.lines.find(x => /COMBUSTIBLE/i.test(x.text) && /(IMP\.?\s*CARGO|Recargo)/i.test(x.text))
  return l ? lastAmount(l) ?? 0 : 0
}

// ── Lectores de PDF por agencia ──────────────────────────────────────────────

function pdfRedur(doc: PdfDoc): InvoiceLineInput[] {
  const out: InvoiceLineInput[] = []
  for (const l of doc.lines) {
    const m = l.text.match(/^(\d{2}\/\d{2}\/20\d{2})\s+(\d{6,})\s+(\S+)\s+(.*)$/)
    if (!m) continue
    const amount = lastAmount(l); if (amount === null) continue
    const ref = cleanRef(m[3])
    out.push(L(ref, ref ? m[3] : `${m[3]} ${m[4]}`.replace(/\s+\d.*$/, '').slice(0, 60), m[2], amount))
  }
  return out
}

function pdfCorditrans(doc: PdfDoc): InvoiceLineInput[] {
  const out: InvoiceLineInput[] = []
  for (const l of doc.lines) {
    const t = l.text.trim()
    if (!/^[A-Z0-9]{8,12}\s+\d{1,2}-\d{2}\s/.test(t)) continue
    const amount = lastAmount(l); if (amount === null) continue
    const toks = t.split(/\s+/)
    const refTok = toks.find(x => CLIENT_RE.test(x) || /^CF?\d{3,}[A-Z]$/i.test(x)) ?? ''
    out.push(L(cleanRef(refTok), refTok || t.slice(0, 60), toks[0], amount))
  }
  return out
}

function pdfPalemania(doc: PdfDoc): InvoiceLineInput[] {
  const out: InvoiceLineInput[] = []
  for (const l of doc.lines) {
    const m = l.text.trim().match(/^(\d{11})\s+(.+?)\s+(\d{5})\s+.*?([\d.]+,\d{2})\s*€$/)
    if (m) out.push(L('', `NOMBRE:${m[2].trim()}`, m[1], parseAmount(m[4])))
  }
  return out
}

function pdfDhl(doc: PdfDoc): InvoiceLineInput[] {
  const total = doc.text.match(/Importe Total \(EUR\)\s+(\d+\.\d{2})/i)
  if (!total) return []
  const i = doc.lines.findIndex(l => /^\d{10}\s/.test(l.text.trim()))
  const dest = i >= 0 ? (doc.lines[i + 1]?.cells[1] ?? '') : ''
  const shipment = i >= 0 ? doc.lines[i].text.trim().split(/\s+/)[0] : ''
  return [L('', dest ? `NOMBRE:${dest}` : 'DHL', shipment, parseFloat(total[1]))]
}

// ── Análisis completo ────────────────────────────────────────────────────────

export interface AnalyzeDeps {
  fetchFile: (f: FolderFile) => Promise<ArrayBuffer>
  readExcel: (data: ArrayBuffer) => Grid
  readPdf: (data: ArrayBuffer) => Promise<PdfDoc>
  onProgress?: (done: number, total: number, name: string) => void
}

export async function analyzeFolder(files: FolderFile[], billing: ApiBillingRow[], loaded: ApiInvoice[], deps: AnalyzeDeps): Promise<Proposal[]> {
  const props: Proposal[] = []
  let done = 0
  const work = files.filter(f => !isCustomsDoc(f.name))
  for (const f of files) {
    const k = ext(f.name)
    const kind: Proposal['kind'] = ['xlsx', 'xls', 'csv'].includes(k) ? 'excel' : k === 'pdf' ? 'pdf' : 'otro'
    const p: Proposal = { file: f, kind, agency: agencyFromFilename(f.name) ?? '', action: 'revisar', reason: '', invoiceNumber: invoiceFromName(f.name),
      supplier: '', lines: [], amount: null, scanned: false, notes: [], keys: keysFromName(f.name) }
    props.push(p)
    if (isCustomsDoc(f.name)) { p.action = 'descartar'; p.reason = 'Documento de aduanas (DUA/BL/CI), no es factura'; continue }
    if (kind === 'otro') { p.action = 'descartar'; p.reason = 'Tipo de archivo no soportado'; continue }
    deps.onProgress?.(done, work.length, f.name)
    let data: ArrayBuffer
    try { data = await deps.fetchFile(f) } catch (e) { p.reason = `No se pudo descargar: ${(e as Error).message}`; continue } finally { done++ }

    if (kind === 'excel') {
      if (!p.agency) { p.reason = 'Excel sin agencia reconocida en el nombre: elige la agencia'; continue }
      try {
        p.lines = parseAgencyInvoice(p.agency, deps.readExcel(data)).lines
        p.action = p.lines.length ? 'cargar' : 'revisar'
        p.reason = p.lines.length ? 'Excel con detalle por cliente' : 'No se encontraron líneas con importe'
      } catch (e) { p.reason = `No se pudo leer el Excel: ${(e as Error).message}` }
      continue
    }

    // PDF
    let doc: PdfDoc
    try { doc = await deps.readPdf(data) } catch (e) { p.reason = `No se pudo leer el PDF: ${(e as Error).message}`; continue }
    p.scanned = doc.scanned
    if (!doc.scanned) {
      const n = invoiceFromText(doc.text); if (n) { p.invoiceNumber = n; p.keys.push(...keysFromName(n), n.replace(/\W/g, '')) }
    }
    if (p.agency === 'DHL' && /WORLDWIDE/i.test(doc.text)) p.agency = 'DHL_EXPORT'
    if (doc.scanned) {
      p.reason = p.agency ? `PDF escaneado de ${p.agency}: sin texto` : 'PDF escaneado: escribe el importe sin IVA'
      if (!p.agency) { p.agency = 'OTROS'; p.supplier = supplierFromName(f.name) }
      continue
    }
    if (p.agency === 'REDUR') {
      p.fuel = fuelFromPdf(doc)
      const lines = pdfRedur(doc)
      const base = doc.text.match(new RegExp(`BASE IMPONIBLE[\\s\\S]{0,200}?\\n\\s*(${NUM.source}|\\d+,\\d{2})\\s+(${NUM.source}|\\d+,\\d{2})`, 'i'))
      const target = base ? r2(parseAmount(base[1]) + parseAmount(base[2])) : r2(lines.reduce((s, l) => s + l.amount, 0) + (p.fuel ?? 0))
      p.lines = p.fuel ? prorate(lines, target) : lines
      if (p.fuel) p.notes.push(`Combustible ${p.fuel.toFixed(2)} € repartido entre los envíos`)
    } else if (p.agency === 'CORDITRANS') p.lines = pdfCorditrans(doc)
    else if (p.agency === 'PALEMANIA') {
      const lines = pdfPalemania(doc)
      const base = doc.text.match(new RegExp(`Base\\s*Imponible:?\\s*(${NUM.source})`, 'i'))
      p.fuel = fuelFromPdf(doc)
      p.lines = base ? prorate(lines, parseAmount(base[1])) : lines
      if (p.fuel) p.notes.push(`Combustible ${p.fuel.toFixed(2)} € repartido entre los envíos`)
    } else if (p.agency === 'DHL' || p.agency === 'DHL_EXPORT') p.lines = pdfDhl(doc)
    else if (!p.agency) {
      const b = detectBase(doc)
      p.agency = 'OTROS'; p.supplier = supplierFromName(f.name); p.amount = b.amount
      p.action = b.amount !== null && !/revisa/.test(b.how) ? 'cargar' : 'revisar'
      p.reason = b.amount !== null ? `Otros transportistas · importe detectado (${b.how})` : 'Otros transportistas · no se encontró el importe: escríbelo'
      continue
    }
    if (p.lines.length) { p.action = 'cargar'; p.reason = `PDF con detalle (${p.lines.length} envíos)` }
    else p.reason = `PDF de ${p.agency} sin lector: súbelo en Excel o pásalo a Otros`
  }

  // ── Duplicados ─────────────────────────────────────────────────────────────
  const excels = props.filter(p => p.kind === 'excel' && p.lines.length)
  for (const p of props.filter(x => x.kind === 'pdf' && x.agency && x.agency !== 'OTROS')) {
    const pdfName = p.file.name.toUpperCase()
    const twin = excels.find(e => e.agency === p.agency &&
      (e.keys.some(k => p.keys.includes(k)) || e.keys.some(k => /\d{5,}/.test(k) && pdfName.includes(k))))
    if (twin) {
      p.action = 'descartar'; p.reason = `Duplicado: se usa el Excel «${twin.file.path}»`
      if (p.fuel && !twin.fuel) { // el Excel de Redur no trae el combustible: se toma del PDF
        twin.fuel = p.fuel
        const sum = twin.lines.reduce((s, l) => s + l.amount, 0)
        twin.lines = prorate(twin.lines, r2(sum + p.fuel))
        twin.notes.push(`Combustible ${p.fuel.toFixed(2)} € (del PDF) repartido entre los envíos`)
      }
      if (!twin.invoiceNumber) twin.invoiceNumber = p.invoiceNumber
      continue
    }
    if (p.scanned && props.some(o => o !== p && o.agency === p.agency && !o.scanned && o.action !== 'descartar')) {
      p.action = 'descartar'; p.reason = `Posible copia escaneada de otra factura de ${p.agency} (compruébalo)`
    }
  }
  for (const p of props) {
    if (p.action === 'descartar') continue
    const dup = loaded.find(i => (i.agency === p.agency && i.invoice_number && norm(i.invoice_number) === norm(p.invoiceNumber)) ||
      i.filename === p.file.path || i.filename === p.file.name)
    if (dup) { p.action = 'descartar'; p.reason = `Ya cargada en este mes (${dup.filename})` }
  }

  // ── Cruce por nombre (Palemanía, DHL) ─────────────────────────────────────
  resolveNames(props, billing)
  for (const p of props) if (p.lines.length) p.amount = r2(p.lines.reduce((s, l) => s + l.amount, 0))
  return props
}

const normName = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(S\.?L\.?U?|S\.?A\.?|S\.?C\.?|C\.?B\.?|SLU|LLC|SOCIEDAD LIMITADA)\b/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

function resolveNames(props: Proposal[], billing: ApiBillingRow[]) {
  const pending = props.flatMap(p => p.lines.filter(l => l.reference_original.startsWith('NOMBRE:')))
  if (!pending.length) return
  const byName = new Map<string, string>()
  for (const b of billing) { const k = normName(b.client_name); if (k.length >= 4 && !byName.has(k)) byName.set(k, b.client_code) }
  const codes = new Set(billing.map(b => b.client_code.toUpperCase()))
  for (const l of pending) {
    const name = l.reference_original.slice(7).trim()
    l.reference_original = name
    let code = CLIENT_RE.test(name) && codes.has(name.toUpperCase()) ? name.toUpperCase() : byName.get(normName(name))
    const k = normName(name)
    if (!code && k.length >= 8) for (const [bn, c] of byName) if (bn.length >= 8 && (bn.startsWith(k) || k.startsWith(bn))) { code = c; break }
    if (code) { l.client_code = code; l.reference = code }
  }
}

/** Resumen de cruce de una propuesta contra la facturación del mes. */
export function matchStats(p: Proposal, billing: ApiBillingRow[]) {
  const match = buildMatcher(billing)
  const total = p.lines.reduce((s, l) => s + l.amount, 0)
  const asig = p.lines.filter(l => match(l.client_code) ?? match(l.reference)).reduce((s, l) => s + l.amount, 0)
  return { total: r2(total), asignado: r2(asig), sinAsignar: r2(total - asig) }
}

/** Líneas a guardar para una propuesta de «Otros transportistas». */
export function otrosLines(p: Proposal): InvoiceLineInput[] {
  return [{ client_code: '', reference: p.supplier, reference_original: p.file.name, agency_invoice: p.invoiceNumber, amount: r2(p.amount ?? 0) }]
}
