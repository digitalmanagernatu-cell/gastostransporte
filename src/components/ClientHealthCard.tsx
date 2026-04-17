import { useMemo } from 'react'
import type { ClientRow } from '../types'
import { TRANSPORT_RANGES, type TransportRangeKey } from '../config'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const STYLES: Record<TransportRangeKey, {
  bg: string; border: string; hoverBorder: string; title: string
  countText: string; bar: string; badgeBg: string; badgeText: string
}> = {
  sano:    { bg: 'bg-emerald-50',  border: 'border-emerald-200', hoverBorder: 'hover:border-emerald-400', title: 'text-emerald-800', countText: 'text-emerald-700', bar: 'bg-emerald-400', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700' },
  vigilar: { bg: 'bg-amber-50',    border: 'border-amber-200',   hoverBorder: 'hover:border-amber-400',   title: 'text-amber-800',   countText: 'text-amber-700',   bar: 'bg-amber-400',   badgeBg: 'bg-amber-100',   badgeText: 'text-amber-700'   },
  revisar: { bg: 'bg-orange-50',   border: 'border-orange-200',  hoverBorder: 'hover:border-orange-400',  title: 'text-orange-800',  countText: 'text-orange-700',  bar: 'bg-orange-400',  badgeBg: 'bg-orange-100',  badgeText: 'text-orange-700'  },
  alerta:  { bg: 'bg-red-50',      border: 'border-red-200',     hoverBorder: 'hover:border-red-400',     title: 'text-red-800',     countText: 'text-red-700',     bar: 'bg-red-400',     badgeBg: 'bg-red-100',     badgeText: 'text-red-700'     },
}

interface Props {
  rows: ClientRow[]
  onSelectRange: (key: TransportRangeKey) => void
}

export default function ClientHealthCard({ rows, onSelectRange }: Props) {
  const stats = useMemo(() => {
    const eligible = rows.filter(r => !r.esSinAsignar && r.baseImponible > 0)
    return TRANSPORT_RANGES.map(range => {
      const clients = eligible.filter(r => r.pctTransporte >= range.min && r.pctTransporte < range.max)
      const totalBilling = clients.reduce((s, r) => s + r.baseImponible, 0)
      const totalTransport = clients.reduce((s, r) => s + r.totalTransporte, 0)
      const avgPct = totalBilling > 0 ? totalTransport / totalBilling : 0
      return { ...range, count: clients.length, totalBilling, totalTransport, avgPct }
    })
  }, [rows])

  const totalClients = stats.reduce((s, r) => s + r.count, 0)
  if (totalClients === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Salud de cartera — % transporte / facturación
        </h3>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
          {totalClients} clientes · clic para ver detalle
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-100">
        {stats.map(s => {
          const st = STYLES[s.key]
          const barPct = totalClients > 0 ? (s.count / totalClients) * 100 : 0
          return (
            <button
              key={s.key}
              onClick={() => onSelectRange(s.key)}
              className={`${st.bg} ${st.border} ${st.hoverBorder} text-left p-4 transition-all hover:shadow-inner group border-0 border-b lg:border-b-0`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${st.title}`}>{s.label}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${st.badgeBg} ${st.badgeText}`}>
                    {s.description}
                  </span>
                </div>
                <span className={`text-3xl font-bold ${st.countText}`}>{s.count}</span>
              </div>

              {/* Progress bar */}
              <div className="bg-white/60 rounded-full h-1.5 mb-3 overflow-hidden">
                <div className={`${st.bar} h-full rounded-full transition-all`} style={{ width: `${barPct}%` }} />
              </div>

              {/* Stats */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Facturación</span>
                  <span className="text-xs font-semibold text-slate-700">{eur(s.totalBilling)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Transporte</span>
                  <span className="text-xs font-semibold text-slate-700">{eur(s.totalTransport)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">% medio</span>
                  <span className={`text-xs font-bold ${st.countText}`}>
                    {(s.avgPct * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400 mt-2 group-hover:text-slate-500 transition-colors">
                Ver detalle →
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
