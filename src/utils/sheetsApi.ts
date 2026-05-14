import { SPREADSHEET_ID, AGENCIES } from '../config'
import type { ClientRow, MonthConfig } from '../types'

const MONTH_ORDER: Record<string, number> = {
  ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3, MAYO: 4, JUNIO: 5,
  JULIO: 6, AGOSTO: 7, SEPTIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11,
}
const MONTH_PATTERN = /^(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(\d{4})$/

// Discovers all month sheet tabs by reading the v3 worksheets feed.
// Each entry's visualizationfeed link contains the real numeric GID.
export async function discoverMonthSheets(): Promise<MonthConfig[]> {
  const url = `https://spreadsheets.google.com/feeds/worksheets/${SPREADSHEET_ID}/public/basic?alt=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo obtener la lista de hojas: ${res.status}`)

  const json = await res.json() as { feed?: { entry?: unknown[] } }
  const entries = json.feed?.entry ?? []

  type WithSort = MonthConfig & { _y: number; _m: number }
  const found: WithSort[] = []

  for (const raw of entries) {
    const entry = raw as Record<string, unknown>
    const sheetName = String((entry.title as Record<string, unknown>)?.['$t'] ?? '').trim()
    const match = MONTH_PATTERN.exec(sheetName)
    if (!match) continue

    const links = (entry.link as Array<Record<string, string>>) ?? []
    const vizLink = links.find(l => l.rel === 'http://schemas.google.com/spreadsheets/2006#visualizationfeed')
    if (!vizLink) continue

    const gidMatch = /[?&]gid=(\d+)/.exec(vizLink.href)
    if (!gidMatch) continue

    const monthUpper = match[1].toUpperCase()
    const year = parseInt(match[2])
    const label = monthUpper.charAt(0) + monthUpper.slice(1).toLowerCase() + ' ' + year

    found.push({ label, sheetName, gid: gidMatch[1], _y: year, _m: MONTH_ORDER[monthUpper] ?? 0 })
  }

  found.sort((a, b) => a._y !== b._y ? a._y - b._y : a._m - b._m)
  return found.map(({ label, sheetName, gid }) => ({ label, sheetName, gid }))
}

function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? 0 : n
}

// Returns true if the string is non-empty and cannot be parsed as a number
function isTextRef(s: string): boolean {
  return s !== '' && isNaN(parseFloat(s.replace(',', '.')))
}

interface GvizCell {
  v: unknown
  f?: string
}

interface GvizRow {
  c: (GvizCell | null)[] | null
}

interface GvizResponse {
  status?: string
  table?: { rows: GvizRow[] }
}

export async function fetchSheetData(gid: string): Promise<ClientRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(
      `Error ${res.status}. Asegúrate de que el sheet está publicado en la web: ` +
      'Archivo → Compartir → Publicar en la web → selecciona la pestaña → Publicar.'
    )
  }

  const text = await res.text()
  const start = text.indexOf('(') + 1
  const end = text.lastIndexOf(')')
  if (start <= 0 || end < 0) throw new Error('Formato de respuesta inesperado del sheet.')

  const parsed: GvizResponse = JSON.parse(text.slice(start, end))
  if (!parsed.table) throw new Error('No se encontraron datos en el sheet.')
  const rows = parsed.table.rows

  const result: ClientRow[] = []
  let inSinAsignarBlock = false

  for (const row of rows) {
    const c = row.c ?? []
    const get = (i: number): unknown => (c[i] ?? null)?.v ?? null

    const rawCodigo = String(get(0) ?? '').trim()
    const rawNombre = String(get(1) ?? '').trim()

    // Detect the --- SIN ASIGNAR --- marker row
    if (
      rawCodigo.toUpperCase().includes('SIN ASIGNAR') ||
      rawNombre.toUpperCase().includes('SIN ASIGNAR')
    ) {
      inSinAsignarBlock = true
      continue
    }

    // Skip total/subtotal rows everywhere
    const upperCheck = (rawNombre || rawCodigo).toUpperCase()
    if (upperCheck === 'TOTAL' || upperCheck.startsWith('TOTAL ') || upperCheck === 'TOTALES') continue

    const agencias: Record<string, number> = {}
    AGENCIES.forEach((ag, i) => { agencias[ag] = parseNum(get(6 + i)) })

    let codigoCliente: string
    let nombreCliente: string
    let totalTransporte: number

    if (inSinAsignarBlock) {
      // Col O and P may carry text albarán references (TRANSAHER and others).
      // Strategy: col A → col O if text → col P if text.
      const rawO = String(get(14) ?? '').trim()
      const rawP = String(get(15) ?? '').trim()

      let resolvedRef = rawCodigo
      if (!resolvedRef || /sin referencia/i.test(resolvedRef)) {
        if (isTextRef(rawO))      resolvedRef = rawO
        else if (isTextRef(rawP)) resolvedRef = rawP
      }

      codigoCliente = resolvedRef
      nombreCliente = !resolvedRef || /sin referencia/i.test(resolvedRef)
        ? '(sin referencia)'
        : '(sin coincidencia)'

      // If col O is a text ref (not a number), totalTransporte must come from agency columns
      const oAsNum = isTextRef(rawO) ? 0 : parseNum(rawO)
      totalTransporte = oAsNum > 0
        ? oAsNum
        : AGENCIES.reduce((s, _, i) => s + parseNum(get(6 + i)), 0)
    } else {
      if (!rawNombre) continue
      codigoCliente = rawCodigo
      nombreCliente = rawNombre
      totalTransporte = parseNum(get(14))
    }

    if (!nombreCliente) continue

    const baseImponible = inSinAsignarBlock ? 0 : parseNum(get(4))
    const totalFacturas  = inSinAsignarBlock ? 0 : parseNum(get(5))
    const comercial      = inSinAsignarBlock ? '' : String(get(2) ?? '').trim()
    const lineaNegocio   = inSinAsignarBlock ? '' : String(get(3) ?? '').trim()
    const pctTransporte  = baseImponible > 0 ? totalTransporte / baseImponible : 0

    result.push({
      codigoCliente,
      nombreCliente,
      comercial,
      lineaNegocio,
      baseImponible,
      totalFacturas,
      agencias,
      totalTransporte,
      pctTransporte,
      esSinAsignar: inSinAsignarBlock,
    })
  }

  return result
}
