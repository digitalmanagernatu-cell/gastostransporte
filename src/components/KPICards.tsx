import type { KPIs } from '../types'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const pct = (n: number) => (n * 100).toFixed(1) + '%'

interface CardProps {
  title: string
  value: string
  sub?: string
  subAlert?: boolean
  borderColor: string
  icon: React.ReactNode
  isLoading?: boolean
}

function Card({ title, value, sub, subAlert, borderColor, icon, isLoading }: CardProps) {
  if (isLoading) {
    return (
      <div className={`bg-white rounded-xl shadow-sm border-l-4 ${borderColor} p-5 animate-pulse`}>
        <div className="h-3 bg-slate-200 rounded w-2/3 mb-3" />
        <div className="h-7 bg-slate-200 rounded w-1/2 mb-2" />
        <div className="h-3 bg-slate-200 rounded w-3/4" />
      </div>
    )
  }
  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${borderColor} p-5 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 leading-none">{value}</p>
          {sub && (
            <p className={`text-xs mt-1.5 ${subAlert ? 'text-red-500 font-medium' : 'text-slate-400'}`}>{sub}</p>
          )}
        </div>
        <div className="flex-shrink-0 opacity-60 mt-0.5">{icon}</div>
      </div>
    </div>
  )
}

interface Props {
  kpis: KPIs
  isLoading: boolean
}

export default function KPICards({ kpis, isLoading }: Props) {
  const loading = isLoading && kpis.numClientes === 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <Card
        title="Total Transporte"
        value={eur(kpis.totalTransporte)}
        sub={kpis.totalTransporteSA > 0 ? `Sin asignar: ${eur(kpis.totalTransporteSA)}` : undefined}
        borderColor="border-teal-500"
        isLoading={loading}
        icon={
          <svg className="w-8 h-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2m8-2H5m8 0l2 2m2-2V8a1 1 0 00-1-1h-2.586a1 1 0 00-.707.293l-2.414 2.414A1 1 0 0015 10.414V16" />
          </svg>
        }
      />
      <Card
        title="Facturación (Base Imp.)"
        value={eur(kpis.totalFacturacion)}
        sub="Suma base imponible"
        borderColor="border-blue-500"
        isLoading={loading}
        icon={
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
      <Card
        title="% Transporte / Facturación"
        value={pct(kpis.pctMedio)}
        sub={kpis.pctMedio > 0.10 ? '⚠ Por encima del objetivo 10%' : '✓ Dentro del objetivo 10%'}
        subAlert={kpis.pctMedio > 0.10}
        borderColor={kpis.pctMedio > 0.10 ? 'border-red-500' : 'border-green-500'}
        isLoading={loading}
        icon={
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        }
      />
      <Card
        title="Clientes con pedidos"
        value={String(kpis.numClientes)}
        sub="Con código asignado"
        borderColor="border-violet-500"
        isLoading={loading}
        icon={
          <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      />
      <Card
        title="Alertas > 10%"
        value={String(kpis.alertas.length)}
        sub={kpis.alertas.length > 0 ? 'Clientes a revisar' : 'Sin alertas activas'}
        subAlert={kpis.alertas.length > 0}
        borderColor={kpis.alertas.length > 0 ? 'border-red-500' : 'border-green-500'}
        isLoading={loading}
        icon={
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
      />
    </div>
  )
}
