import type { ClientRow, DashboardFilters, KPIs, AgenciaData, LineaNegocioData, ComercialData } from '../types'
import { AGENCIES, ALERT_THRESHOLD } from '../config'

export function filtrar(rows: ClientRow[], f: DashboardFilters): ClientRow[] {
  return rows.filter(r => {
    if (!f.includeSinAsignar && r.esSinAsignar) return false
    if (r.esSinAsignar) return true // sin asignar rows skip linea/comercial filters
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
  const totalPedidos = asignados.reduce((s, r) => s + r.totalFacturas, 0)
  const alertas = asignados.filter(r => r.pctTransporte > ALERT_THRESHOLD)
  const pctMedio = totalFacturacion > 0 ? totalTransporte / totalFacturacion : 0
  return {
    totalPedidos,
    totalFacturacion,
    totalTransporte,
    pctMedio,
    numClientes: asignados.length,
    alertas,
    totalTransporteSA,
  }
}

export function byAgencia(rows: ClientRow[]): AgenciaData[] {
  const asignados = rows.filter(r => !r.esSinAsignar)
  const sinAsignar = rows.filter(r => r.esSinAsignar)

  const totClientes: Record<string, number> = {}
  const totNatu: Record<string, number> = {}
  for (const ag of AGENCIES) { totClientes[ag] = 0; totNatu[ag] = 0 }

  for (const r of asignados) {
    for (const ag of AGENCIES) totClientes[ag] += r.agencias[ag] ?? 0
  }
  for (const r of sinAsignar) {
    for (const ag of AGENCIES) totNatu[ag] += r.agencias[ag] ?? 0
  }

  return AGENCIES
    .map(ag => ({
      agencia: ag,
      total: totClientes[ag] + totNatu[ag],
      clientes: totClientes[ag],
      natu: totNatu[ag],
    }))
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

export function getOpciones(rows: ClientRow[], lineaNegocioFilter = '__all__') {
  const asignados = rows.filter(r => !r.esSinAsignar)
  const lineas = [...new Set(asignados.filter(r => r.lineaNegocio).map(r => r.lineaNegocio))].sort()

  const source = lineaNegocioFilter !== '__all__'
    ? asignados.filter(r => r.lineaNegocio === lineaNegocioFilter)
    : asignados
  const comerciales = [...new Set(source.filter(r => r.comercial).map(r => r.comercial))].sort()

  return { lineas, comerciales }
}
