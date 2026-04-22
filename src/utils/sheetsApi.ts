import { SPREADSHEET_ID, AGENCIES } from '../config'
import type { ClientRow } from '../types'

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
  table: { rows: GvizRow[] }
}

export async function fetchSheetData(gid: string): Promise<ClientRow[]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`

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
  const rows = parsed.table?.rows
  if (!rows) return []

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
