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

  for (const row of rows) {
    const c = row.c ?? []
    const get = (i: number): unknown => (c[i] ?? null)?.v ?? null

    const nombreCliente = String(get(1) ?? '').trim()
    if (!nombreCliente) continue

    const upper = nombreCliente.toUpperCase()
    if (upper === 'TOTAL' || upper.startsWith('TOTAL ') || upper === 'TOTALES') continue

    const codigoCliente = String(get(0) ?? '').trim()
    const comercial = String(get(2) ?? '').trim()
    const lineaNegocio = String(get(3) ?? '').trim()
    const baseImponible = parseNum(get(4))
    const totalFacturas = parseNum(get(5))

    const agencias: Record<string, number> = {}
    AGENCIES.forEach((ag, i) => {
      agencias[ag] = parseNum(get(6 + i))
    })

    const totalTransporte = parseNum(get(14))
    const rawPct = parseNum(get(15))
    // Google Sheets almacena % como decimal (0.15 = 15%), pero a veces viene como 15
    const pctTransporte = rawPct > 1 ? rawPct / 100 : rawPct

    const esSinAsignar =
      upper.includes('SIN ASIGNAR') ||
      codigoCliente.toUpperCase().includes('SIN ASIGNAR')

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
      esSinAsignar,
    })
  }

  return result
}
