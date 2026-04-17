import { useState } from 'react'
import type { ClientRow } from '../types'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const COLLAPSED_COUNT = 9

interface Props {
  alertas: ClientRow[]
  onClientClick?: (codigoCliente: string) => void
}

export default function AlertsPanel({ alertas, onClientClick }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (alertas.length === 0) return null

  const sorted = [...alertas].sort((a, b) => b.pctTransporte - a.pctTransporte)
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_COUNT)
  const hidden = sorted.length - COLLAPSED_COUNT

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-red-100 border-b border-red-200 px-5 py-3 flex items-center gap-2">
        <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h2 className="font-semibold text-red-800 text-sm">
          Alertas — Gasto de transporte &gt; 10% de facturación
        </h2>
        <span className="ml-auto bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
          {alertas.length}
        </span>
        {onClientClick && (
          <span className="text-xs text-red-500 italic">Clic en tarjeta para ver detalle</span>
        )}
      </div>

      {/* Cards */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map(r => {
          const pctVal = r.pctTransporte * 100
          const barWidth = Math.min((pctVal / 30) * 100, 100)
          return (
            <div
              key={`${r.codigoCliente}-${r.nombreCliente}`}
              onClick={() => onClientClick?.(r.codigoCliente)}
              className={`bg-white border border-red-200 rounded-lg p-3 hover:shadow-md transition-all ${
                onClientClick ? 'cursor-pointer hover:border-red-400 hover:bg-red-50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{r.nombreCliente}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {r.codigoCliente && <span className="font-mono">{r.codigoCliente}</span>}
                    {r.codigoCliente && r.lineaNegocio && ' · '}
                    {r.lineaNegocio}
                  </p>
                  {r.comercial && <p className="text-xs text-slate-400">{r.comercial}</p>}
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-base font-bold text-red-600 whitespace-nowrap">
                    {pctVal.toFixed(1)}%
                  </span>
                  {onClientClick && (
                    <span className="text-xs text-slate-300 mt-0.5">Ver detalle →</span>
                  )}
                </div>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Transp: <span className="font-medium text-slate-700">{eur(r.totalTransporte)}</span></span>
                <span>Fact: <span className="font-medium text-slate-700">{eur(r.baseImponible)}</span></span>
              </div>
              <div className="bg-red-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-red-500 h-full rounded-full" style={{ width: `${barWidth}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Ver más / Ver menos */}
      {sorted.length > COLLAPSED_COUNT && (
        <div className="px-4 pb-4 flex justify-center">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-800 bg-red-100 hover:bg-red-200 px-4 py-2 rounded-lg transition-colors"
          >
            {expanded ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                Ver menos
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Ver {hidden} más
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
