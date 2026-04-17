import { SPREADSHEET_ID, AGENCIES } from '../config'
import type { ClientRow } from '../types'

function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? 0 : n
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

    if (!inSinAsignarBlock) {
      // Regular client rows: require a client name, skip totals
      if (!rawNombre) continue
      const upper = rawNombre.toUpperCase()
      if (upper === 'TOTAL' || upper.startsWith('TOTAL ') || upper === 'TOTALES') continue
    }

    // Build display name; sin asignar rows may have empty col B
    const nombreCliente = inSinAsignarBlock
      ? (rawNombre || rawCodigo || 'Sin referencia')
      : rawNombre
    if (!nombreCliente) continue

    const codigoCliente = rawCodigo
    const comercial = inSinAsignarBlock ? '' : String(get(2) ?? '').trim()
    const lineaNegocio = inSinAsignarBlock ? '' : String(get(3) ?? '').trim()
    const baseImponible = inSinAsignarBlock ? 0 : parseNum(get(4))
    const totalFacturas = inSinAsignarBlock ? 0 : parseNum(get(5))

    const agencias: Record<string, number> = {}
    AGENCIES.forEach((ag, i) => {
      agencias[ag] = parseNum(get(6 + i))
    })

    const totalTransporte = parseNum(get(14))
    const pctTransporte = baseImponible > 0 ? totalTransporte / baseImponible : 0

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
