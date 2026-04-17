import type { ClientRow, DashboardFilters, KPIs, AgenciaData, LineaNegocioData, ComercialData } from '../types'
import { AGENCIES, ALERT_THRESHOLD } from '../config'

export function filtrar(rows: ClientRow[], f: DashboardFilters): ClientRow[] {
  return rows.filter(r => {
    if (f.lineaNegocio !== '__all__' && r.lineaNegocio !== f.lineaNegocio) return false
    if (f.comercial !== '__all__' && r.comercial !== f.comercial) return false
    return true
  })
}

export function calcKPIs(rows: ClientRow[]): KPIs {
  const asignados = rows.filter(r => !r.esSinAsignar)
  const sinAsignar = rows.filter(r => r.esSinAsignar)
  const totalTransporteSA = sinAsignar.reduce((s, r) => s + r.totalTransporte, 0)
  const totalTransporte = rows.reduce((s, r) => s + r.totalTransporte, 0)
  const totalFacturacion = asignados.reduce((s, r) => s + r.baseImponible, 0)
  const alertas = asignados.filter(r => r.pctTransporte > ALERT_THRESHOLD)
  const pctMedio = totalFacturacion > 0 ? totalTransporte / totalFacturacion : 0
  return {
    totalTransporte,
    totalFacturacion,
    pctMedio,
    numClientes: asignados.length,
    alertas,
    totalTransporteSA,
  }
}

export function byAgencia(rows: ClientRow[]): AgenciaData[] {
  const totales: Record<string, number> = {}
  for (const ag of AGENCIES) totales[ag] = 0
  for (const r of rows) {
    for (const ag of AGENCIES) totales[ag] += r.agencias[ag] ?? 0
  }
  return AGENCIES
    .map(ag => ({ agencia: ag, total: totales[ag] }))
    .filter(a => a.total > 0)
    .sort((a, b) => b.total - a.total)
}

export function byLineaNegocio(rows: ClientRow[]): LineaNegocioData[] {
  const map: Record<string, LineaNegocioData> = {}
  for (const r of rows.filter(r => !r.esSinAsignar)) {
    const ln = r.lineaNegocio || 'Sin clasificar'
    if (!map[ln]) map[ln] = { lineaNegocio: ln, totalTransporte: 0, totalFacturacion: 0, count: 0 }
    map[ln].totalTransporte += r.totalTransporte
    map[ln].totalFacturacion += r.baseImponible
    map[ln].count++
  }
  return Object.values(map).sort((a, b) => b.totalTransporte - a.totalTransporte)
}

export function byComercial(rows: ClientRow[]): ComercialData[] {
  const map: Record<string, ComercialData> = {}
  for (const r of rows.filter(r => !r.esSinAsignar)) {
    const com = r.comercial || 'Sin asignar'
    if (!map[com]) map[com] = { comercial: com, totalTransporte: 0, totalFacturacion: 0, count: 0 }
    map[com].totalTransporte += r.totalTransporte
    map[com].totalFacturacion += r.baseImponible
    map[com].count++
  }
  return Object.values(map).sort((a, b) => b.totalTransporte - a.totalTransporte)
}

export function topClientes(rows: ClientRow[], n = 10): ClientRow[] {
  return rows
    .filter(r => !r.esSinAsignar && r.totalTransporte > 0)
    .sort((a, b) => b.totalTransporte - a.totalTransporte)
    .slice(0, n)
}

export function getOpciones(rows: ClientRow[]) {
  const asignados = rows.filter(r => !r.esSinAsignar)
  const lineas = [...new Set(asignados.filter(r => r.lineaNegocio).map(r => r.lineaNegocio))].sort()
  const comerciales = [...new Set(asignados.filter(r => r.comercial).map(r => r.comercial))].sort()
  return { lineas, comerciales }
}
