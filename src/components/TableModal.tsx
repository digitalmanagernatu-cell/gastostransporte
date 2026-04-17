import { useEffect } from 'react'
import DataTable from './DataTable'
import type { ClientRow } from '../types'
import { TRANSPORT_RANGES, type TransportRangeKey } from '../config'

interface Props {
  rows: ClientRow[]
  isLoading: boolean
  onClose: () => void
  targetClient?: string | null
  initialRange?: TransportRangeKey | null
  initialSinAsignar?: boolean
}

export default function TableModal({ rows, isLoading, onClose, targetClient, initialRange, initialSinAsignar }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const rangeLabel = initialRange ? TRANSPORT_RANGES.find(r => r.key === initialRange)?.label : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex flex-col h-full max-h-screen">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 10h18M3 14h18M10 4v16M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Tabla de facturación completa</h2>
              <p className="text-xs text-slate-400">
                {rows.filter(r => !r.esSinAsignar).length} clientes
                {initialSinAsignar && ` · Mostrando gastos sin asignación`}
                {rangeLabel && ` · Filtrado: ${rangeLabel}`}
                {targetClient && ' · Resaltando cliente seleccionado'}
                {' · Pulsa Esc para cerrar'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cerrar
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50">
          <DataTable rows={rows} isLoading={isLoading} targetClient={targetClient} initialRange={initialRange} initialSinAsignar={initialSinAsignar} />
        </div>
      </div>
    </div>
  )
}
