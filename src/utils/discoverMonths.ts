import { SPREADSHEET_ID, MONTHS_CONFIG } from '../config'
import type { MonthConfig } from '../types'

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
]
const MONTH_RE = new RegExp(`^(${MESES.join('|')}|SETIEMBRE)\\s+(\\d{4})$`)

interface SheetsApiResponse {
  sheets?: { properties?: { title?: string; sheetId?: number } }[]
}

function toMonthConfig(title: string, sheetId: number): (MonthConfig & { order: number }) | null {
  const m = title.trim().toUpperCase().match(MONTH_RE)
  if (!m) return null
  const mesIdx = m[1] === 'SETIEMBRE' ? 8 : MESES.indexOf(m[1])
  const year = Number(m[2])
  const label = `${m[1].charAt(0)}${m[1].slice(1).toLowerCase()} ${year}`
  return { label, sheetName: title, gid: String(sheetId), order: year * 12 + mesIdx }
}

/**
 * Lista las pestañas "MES YYYY" del spreadsheet vía Google Sheets API v4.
 * Si no hay API key o la llamada falla, devuelve MONTHS_CONFIG como fallback.
 */
export async function discoverMonths(): Promise<{ months: MonthConfig[]; warning: string | null }> {
  const fallback = [...MONTHS_CONFIG]
  const key = import.meta.env.VITE_SHEETS_API_KEY
  if (!key) return { months: fallback, warning: null }

  try {
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}` +
      `?key=${encodeURIComponent(key)}&fields=sheets(properties(title,sheetId))`
    const res = await fetch(url)
    if (!res.ok) {
      let detail = ''
      try { detail = (await res.json())?.error?.message ?? '' } catch { /* ignore */ }
      throw new Error(`Sheets API ${res.status}${detail ? `: ${detail}` : ''}`)
    }
    const data: SheetsApiResponse = await res.json()
    const found = (data.sheets ?? [])
      .map(s => s.properties)
      .filter((p): p is { title: string; sheetId: number } =>
        typeof p?.title === 'string' && typeof p?.sheetId === 'number')
      .map(p => toMonthConfig(p.title, p.sheetId))
      .filter((m): m is MonthConfig & { order: number } => m !== null)
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...m }) => m)

    if (found.length === 0) throw new Error('no se encontró ninguna pestaña con formato "MES AAAA"')
    return { months: found, warning: null }
  } catch (err) {
    console.warn('[discoverMonths] usando MONTHS_CONFIG:', err)
    return {
      months: fallback,
      warning: `No se pudo detectar automáticamente las pestañas (${(err as Error).message}). Se muestran los meses configurados manualmente.`,
    }
  }
}
