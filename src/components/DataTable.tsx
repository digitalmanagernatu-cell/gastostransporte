import { useState, useEffect, useRef, useMemo } from 'react'
import type { ClientRow } from '../types'
import { AGENCIES, TRANSPORT_RANGES, type TransportRangeKey } from '../config'

const eur = (n: number) =>
  n > 0
    ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
    : '—'

const pctFmt = (n: number) => (n * 100).toFixed(1) + '%'

type SortKey = 'nombreCliente' | 'totalTransporte' | 'pctTransporte' | 'baseImponible'

interface Props {
  rows: ClientRow[]
  isLoading: boolean
  targetClient?: string | null
  initialRange?: TransportRangeKey | null
  initialSinAsignar?: boolean
}

export default function DataTable({ rows, isLoading, targetClient, initialRange, initialSinAsignar }: Props) {
  const [showSinAsignar, setShowSinAsignar] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('totalTransporte')
  const [sortAsc, setSortAsc] = useState(false)
  const [search, setSearch] = useState('')
  const [filterLinea, setFilterLinea] = useState('__all__')
  const [filterComercial, setFilterComercial] = useState('__all__')
  const [filterRange, setFilterRange] = useState<TransportRangeKey | '__all__'>(initialRange ?? '__all__')
  const [filterOnlySinAsignar, setFilterOnlySinAsignar] = useState(initialSinAsignar ?? false)
  const [filterAgencia, setFilterAgencia] = useState('__all__')
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

  useEffect(() => {
    if (!targetClient) return
    const timer = setTimeout(() => {
      const el = rowRefs.current.get(targetClient)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    return () => clearTimeout(timer)
  }, [targetClient])

  const lineas = useMemo(() => {
    const s = new Set<string>()
    rows.forEach(r => { if (r.lineaNegocio && !r.esSinAsignar) s.add(r.lineaNegocio) })
    return [...s].sort()
  }, [rows])

  const comerciales = useMemo(() => {
    const s = new Set<string>()
    rows.forEach(r => {
      if (r.comercial && !r.esSinAsignar) {
        if (filterLinea === '__all__' || r.lineaNegocio === filterLinea) s.add(r.comercial)
      }
    })
    return [...s].sort()
  }, [rows, filterLinea])

  // Reset comercial when it's no longer valid after linea change
  useEffect(() => {
    if (filterComercial !== '__all__' && !comerciales.includes(filterComercial)) {
      setFilterComercial('__all__')
    }
  }, [comerciales, filterComercial])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const range = filterRange !== '__all__' ? TRANSPORT_RANGES.find(r => r.key === filterRange) : null
    return rows
      .filter(r => {
        if (filterOnlySinAsignar) return r.esSinAsignar
        if (!showSinAsignar && r.esSinAsignar) return false
        if (q && !r.nombreCliente.toLowerCase().includes(q) && !r.codigoCliente.toLowerCase().includes(q)) return false
        if (filterLinea !== '__all__' && r.lineaNegocio !== filterLinea && !r.esSinAsignar) return false
        if (filterComercial !== '__all__' && r.comercial !== filterComercial) return false
        if (range && !r.esSinAsignar && (r.pctTransporte < range.min || r.pctTransporte >= range.max)) return false
        if (range && r.esSinAsignar) return false
        if (filterAgencia !== '__all__' && !((r.agencias[filterAgencia] ?? 0) > 0)) return false
        return true
      })
      .slice()
      .sort((a, b) => {
        const av = a[sortKey] as number | string
        const bv = b[sortKey] as number | string
        if (typeof av === 'string' && typeof bv === 'string') {
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
        }
        return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
      })
  }, [rows, showSinAsignar, filterOnlySinAsignar, search, filterLinea, filterComercial, filterRange, filterAgencia, sortKey, sortAsc])

  const hasFilters = search.trim() !== '' || filterLinea !== '__all__' || filterComercial !== '__all__' || filterRange !== '__all__' || filterAgencia !== '__all__' || filterOnlySinAsignar

  const clearFilters = () => {
    setSearch('')
    setFilterLinea('__all__')
    setFilterComercial('__all__')
    setFilterRange('__all__')
    setFilterAgencia('__all__')
    setFilterOnlySinAsignar(false)
    setShowSinAsignar(true)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-1 opacity-50">{sortKey === k ? (sortAsc ? '↑' : '↓') : '↕'}</span>
  )

  const selectCls = 'text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-400 min-w-[130px]'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-slate-400 rounded-full" />
            Detalle por Cliente
          </h3>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSinAsignar && !filterOnlySinAsignar}
                  disabled={filterOnlySinAsignar}
                  onChange={e => setShowSinAsignar(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 disabled:opacity-40"
                />
                Mostrar sin asignar
              </label>
              <label className="flex items-center gap-1.5 text-xs text-amber-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filterOnlySinAsignar}
                  onChange={e => setFilterOnlySinAsignar(e.target.checked)}
                  className="rounded border-amber-300 text-amber-500 focus:ring-amber-400"
                />
                Solo sin asignar
              </label>
            </div>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {visible.length} registros
            </span>
          </div>
        </div>

        {/* Search + selects */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <select value={filterLinea} onChange={e => setFilterLinea(e.target.value)} className={selectCls}>
            <option value="__all__">Todas las líneas</option>
            {lineas.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <select value={filterComercial} onChange={e => setFilterComercial(e.target.value)} className={selectCls}>
            <option value="__all__">Todos los comerciales</option>
            {comerciales.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filterRange} onChange={e => setFilterRange(e.target.value as TransportRangeKey | '__all__')} className={selectCls}>
            <option value="__all__">Todos los rangos</option>
            {TRANSPORT_RANGES.map(r => (
              <option key={r.key} value={r.key}>{r.label} ({r.description})</option>
            ))}
          </select>

          <select value={filterAgencia} onChange={e => setFilterAgencia(e.target.value)} className={selectCls}>
            <option value="__all__">Todas las agencias</option>
            {AGENCIES.map(ag => <option key={ag} value={ag}>{ag}</option>)}
          </select>

          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-teal-600 hover:text-teal-800 font-medium px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap">
              Limpiar filtros
            </button>
          )}
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
        {targetClient && (
          <span className="flex items-center gap-1.5 text-blue-500 font-medium">
            <span className="w-3 h-3 bg-blue-100 rounded border border-blue-400" />
            Cliente seleccionado
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              <th className="px-3 py-3 font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10">Código</th>
              <th className="px-3 py-3 font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleSort('nombreCliente')}>
                Cliente <SortIcon k="nombreCliente" />
              </th>
              <th className="px-3 py-3 font-semibold text-slate-500">Comercial</th>
              <th className="px-3 py-3 font-semibold text-slate-500">Línea</th>
              <th className="px-3 py-3 font-semibold text-slate-500 text-right cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleSort('baseImponible')}>
                Facturación <SortIcon k="baseImponible" />
              </th>
              <th className="px-3 py-3 font-semibold text-slate-500 text-right">Facturas</th>
              {AGENCIES.map(ag => (
                <th key={ag} className="px-3 py-3 font-semibold text-slate-400 text-right">{ag}</th>
              ))}
              <th className="px-3 py-3 font-semibold text-slate-700 text-right cursor-pointer hover:text-slate-900 select-none"
                onClick={() => toggleSort('totalTransporte')}>
                Total Transp. <SortIcon k="totalTransporte" />
              </th>
              <th className="px-3 py-3 font-semibold text-slate-500 text-right cursor-pointer hover:text-slate-700 select-none"
                onClick={() => toggleSort('pctTransporte')}>
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
                      <div className="h-3 bg-slate-200 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
              : visible.length === 0
              ? (
                <tr>
                  <td colSpan={6 + AGENCIES.length + 2} className="px-5 py-10 text-center text-sm text-slate-400">
                    No hay resultados para los filtros aplicados
                  </td>
                </tr>
              )
              : visible.map((r, i) => {
                const isTarget = r.codigoCliente === targetClient
                const isAlert = !r.esSinAsignar && r.pctTransporte > 0.10
                const rowBg = isTarget
                  ? 'bg-blue-50 hover:bg-blue-100'
                  : r.esSinAsignar
                  ? 'bg-amber-50 hover:bg-amber-100'
                  : isAlert
                  ? 'bg-red-50 hover:bg-red-100'
                  : i % 2 === 0
                  ? 'bg-white hover:bg-slate-50'
                  : 'bg-slate-50 hover:bg-slate-100'
                const stickyBg = isTarget
                  ? 'bg-blue-50'
                  : r.esSinAsignar
                  ? 'bg-amber-50'
                  : isAlert
                  ? 'bg-red-50'
                  : i % 2 === 0
                  ? 'bg-white'
                  : 'bg-slate-50'
                return (
                  <tr
                    key={`${r.codigoCliente}-${i}`}
                    ref={el => {
                      if (el) rowRefs.current.set(r.codigoCliente, el)
                      else rowRefs.current.delete(r.codigoCliente)
                    }}
                    className={`border-b transition-colors ${isTarget ? 'border-blue-300 ring-1 ring-inset ring-blue-300' : 'border-slate-100'} ${rowBg}`}
                  >
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
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{eur(r.totalTransporte)}</td>
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
