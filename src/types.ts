export interface ClientRow {
  codigoCliente: string
  nombreCliente: string
  comercial: string
  lineaNegocio: string
  baseImponible: number
  totalFacturas: number
  agencias: Record<string, number>
  totalTransporte: number
  pctTransporte: number
  esSinAsignar: boolean
}

export interface MonthConfig {
  readonly label: string
  readonly sheetName: string
  readonly gid: string
}

export interface DashboardFilters {
  lineaNegocio: string
  comercial: string
}

export interface KPIs {
  totalTransporte: number
  totalFacturacion: number
  pctMedio: number
  numClientes: number
  alertas: ClientRow[]
  totalTransporteSA: number
}

export interface AgenciaData {
  agencia: string
  total: number
}

export interface LineaNegocioData {
  lineaNegocio: string
  totalTransporte: number
  totalFacturacion: number
  count: number
}

export interface ComercialData {
  comercial: string
  totalTransporte: number
  totalFacturacion: number
  count: number
}
