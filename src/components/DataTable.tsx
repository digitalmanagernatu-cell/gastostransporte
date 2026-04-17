import { useState } from 'react'
import type { ClientRow } from '../types'
import { AGENCIES } from '../config'

const eur = (n: number) =>
  n > 0
    ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
    : '—'

const pctFmt = (n: number) => (n * 100).toFixed(1) + '%'

type SortKey = 'nombreCliente' | 'totalTransporte' | 'pctTransporte' | 'baseImponible'

interface Props {
  rows: ClientRow[]
  isLoading: boolean
}

export default function DataTable({ rows, isLoading }: Props) {
  const [showSinAsignar, setShowSinAsignar] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('totalTransporte')
  const [sortAsc, setSortAsc] = useState(false)

  const visible = (showSinAsignar ? rows : rows.filter(r => !r.esSinAsignar))
    .slice()
    .sort((a, b) => {
      const av = a[sortKey] as number | string
      const bv = b[sortKey] as number | string
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const an = av as number
      const bn = bv as number
      return sortAsc ? an - bn : bn - an
    })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-1 opacity-50">
      {sortKey === k ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-slate-400 rounded-full" />
          Detalle por Cliente
        </h3>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSinAsignar}
              onChange={e => setShowSinAsignar(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Mostrar fila "Sin Asignar"
          </label>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {visible.length} registros
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-red-100 rounded border border-red-200" />
          Alerta: transporte &gt; 10%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-amber-50 rounded border border-amber-200" />
          Sin asignar
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              <th className="px-3 py-3 font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10">Código</th>
              <th
                className="px-3 py-3 font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleSort('nombreCliente')}
              >
                Cliente <SortIcon k="nombreCliente" />
              </th>
              <th className="px-3 py-3 font-semibold text-slate-500">Comercial</th>
              <th className="px-3 py-3 font-semibold text-slate-500">Línea</th>
              <th
                className="px-3 py-3 font-semibold text-slate-500 text-right cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleSort('baseImponible')}
              >
                Facturación <SortIcon k="baseImponible" />
              </th>
              <th className="px-3 py-3 font-semibold text-slate-500 text-right">Facturas</th>
              {AGENCIES.map(ag => (
                <th key={ag} className="px-3 py-3 font-semibold text-slate-400 text-right">{ag}</th>
              ))}
              <th
                className="px-3 py-3 font-semibold text-slate-700 text-right cursor-pointer hover:text-slate-900 select-none"
                onClick={() => toggleSort('totalTransporte')}
              >
                Total Transp. <SortIcon k="totalTransporte" />
              </th>
              <th
                className="px-3 py-3 font-semibold text-slate-500 text-right cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleSort('pctTransporte')}
              >
                % Transp. <SortIcon k="pctTransporte" />
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && visible.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100">
                  {Array.from({ length: 6 + AGENCIES.length }).map((_, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="h-3 bg-slate-200 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
              : visible.map((r, i) => {
                const isAlert = !r.esSinAsignar && r.pctTransporte > 0.10
                const rowBg = r.esSinAsignar
                  ? 'bg-amber-50 hover:bg-amber-100'
                  : isAlert
                  ? 'bg-red-50 hover:bg-red-100'
                  : i % 2 === 0
                  ? 'bg-white hover:bg-slate-50'
                  : 'bg-slate-50 hover:bg-slate-100'
                const stickyBg = r.esSinAsignar
                  ? 'bg-amber-50'
                  : isAlert
                  ? 'bg-red-50'
                  : i % 2 === 0
                  ? 'bg-white'
                  : 'bg-slate-50'
                return (
                  <tr key={`${r.codigoCliente}-${i}`} className={`border-b border-slate-100 transition-colors ${rowBg}`}>
                    <td className={`px-3 py-2 font-mono text-slate-400 sticky left-0 z-10 ${stickyBg}`}>
                      {r.codigoCliente || '—'}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800 max-w-[180px]">
                      <span className="block truncate" title={r.nombreCliente}>{r.nombreCliente}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.comercial || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.lineaNegocio || '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{eur(r.baseImponible)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{r.totalFacturas > 0 ? r.totalFacturas : '—'}</td>
                    {AGENCIES.map(ag => (
                      <td key={ag} className="px-3 py-2 text-right text-slate-500">
                        {(r.agencias[ag] ?? 0) > 0 ? eur(r.agencias[ag]) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">
                      {eur(r.totalTransporte)}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${isAlert ? 'text-red-600' : 'text-slate-600'}`}>
                      {r.esSinAsignar ? '—' : pctFmt(r.pctTransporte)}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
