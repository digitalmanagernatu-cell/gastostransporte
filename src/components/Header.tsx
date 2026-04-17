import type { MonthConfig } from '../types'

interface Props {
  months: readonly MonthConfig[]
  selectedGid: string
  onSelectMonth: (gid: string) => void
  isLoading: boolean
  lastUpdated: Date | null
}

export default function Header({ months, selectedGid, onSelectMonth, isLoading, lastUpdated }: Props) {
  const showAnual = months.length > 1

  return (
    <header className="bg-slate-900 text-white shadow-xl">
      <div className="max-w-screen-2xl mx-auto px-4">
        {/* Top bar */}
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2m8-2H5m8 0l2 2m2-2V8a1 1 0 00-1-1h-2.586a1 1 0 00-.707.293l-2.414 2.414A1 1 0 0015 10.414V16" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight tracking-tight">
                Control de Gastos de Transporte
              </h1>
              <p className="text-slate-400 text-xs">
                NATU ·{' '}
                {lastUpdated
                  ? `Actualizado ${lastUpdated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Cargando datos del sheet...'}
              </p>
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-teal-300 text-sm">
              <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              <span className="hidden sm:inline">Actualizando...</span>
            </div>
          )}
        </div>

        {/* Month tabs */}
        <div className="flex gap-1">
          {showAnual && (
            <button
              onClick={() => onSelectMonth('anual')}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${
                selectedGid === 'anual'
                  ? 'bg-slate-50 text-slate-900'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              📊 Resumen Anual
            </button>
          )}
          {months.map(m => (
            <button
              key={m.gid}
              onClick={() => onSelectMonth(m.gid)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${
                selectedGid === m.gid
                  ? 'bg-slate-50 text-slate-900'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
