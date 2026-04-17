import type { DashboardFilters } from '../types'

interface Props {
  filters: DashboardFilters
  opciones: { lineas: string[]; comerciales: string[] }
  onChange: (f: DashboardFilters) => void
  label: string
  totalRows: number
  filteredRows: number
}

export default function FiltersBar({ filters, opciones, onChange, label, totalRows, filteredRows }: Props) {
  const hasFilters = filters.lineaNegocio !== '__all__' || filters.comercial !== '__all__'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Label */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-2.5 h-2.5 bg-teal-500 rounded-full flex-shrink-0" />
          <span className="text-slate-800 font-semibold truncate">{label}</span>
          {hasFilters && (
            <span className="text-xs text-slate-400">
              ({filteredRows} de {totalRows} clientes)
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500 whitespace-nowrap uppercase tracking-wide">
              Línea de negocio
            </label>
            <select
              value={filters.lineaNegocio}
              onChange={e => onChange({ ...filters, lineaNegocio: e.target.value })}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="__all__">Todas</option>
              {opciones.lineas.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500 whitespace-nowrap uppercase tracking-wide">
              Comercial
            </label>
            <select
              value={filters.comercial}
              onChange={e => onChange({ ...filters, comercial: e.target.value })}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="__all__">Todos</option>
              {opciones.comerciales.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={() => onChange({ lineaNegocio: '__all__', comercial: '__all__' })}
              className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Active filter tags */}
      {hasFilters && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
          {filters.lineaNegocio !== '__all__' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-700 text-xs rounded-full border border-teal-200">
              Línea: {filters.lineaNegocio}
              <button onClick={() => onChange({ ...filters, lineaNegocio: '__all__' })}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          )}
          {filters.comercial !== '__all__' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-700 text-xs rounded-full border border-violet-200">
              Comercial: {filters.comercial}
              <button onClick={() => onChange({ ...filters, comercial: '__all__' })}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
