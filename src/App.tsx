import { useState, useEffect, useMemo } from 'react'
import { fetchSheetData } from './utils/sheetsApi'
import {
  filtrar, calcKPIs, byAgencia, byLineaNegocio,
  byComercial, topClientes, getOpciones,
} from './utils/dataUtils'
import type { ClientRow, DashboardFilters } from './types'
import { MONTHS_CONFIG } from './config'
import Header from './components/Header'
import FiltersBar from './components/FiltersBar'
import KPICards from './components/KPICards'
import AlertsPanel from './components/AlertsPanel'
import DataTable from './components/DataTable'
import AgencyBarChart from './components/charts/AgencyBarChart'
import LineaNegocioChart from './components/charts/LineaNegocioChart'
import ComercialChart from './components/charts/ComercialChart'
import TopClientsChart from './components/charts/TopClientsChart'
import MonthlyTrendChart from './components/charts/MonthlyTrendChart'

export default function App() {
  const [monthData, setMonthData] = useState<Record<string, ClientRow[]>>({})
  const [loadingGids, setLoadingGids] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedGid, setSelectedGid] = useState<string>(
    MONTHS_CONFIG.length > 0 ? MONTHS_CONFIG[0].gid : 'anual'
  )
  const [filters, setFilters] = useState<DashboardFilters>({
    lineaNegocio: '__all__',
    comercial: '__all__',
  })

  // Fetch all months on mount
  useEffect(() => {
    const gids = MONTHS_CONFIG.map(m => m.gid)
    setLoadingGids(new Set(gids))

    Promise.all(
      MONTHS_CONFIG.map(m =>
        fetchSheetData(m.gid)
          .then(data => ({ gid: m.gid, data, error: null }))
          .catch(err => ({ gid: m.gid, data: null, error: (err as Error).message }))
      )
    ).then(results => {
      const newData: Record<string, ClientRow[]> = {}
      const newErrors: Record<string, string> = {}
      for (const r of results) {
        if (r.data !== null) newData[r.gid] = r.data
        if (r.error) newErrors[r.gid] = r.error
      }
      setMonthData(newData)
      setErrors(newErrors)
      setLoadingGids(new Set())
      setLastUpdated(new Date())
    })
  }, [])

  const isLoading = loadingGids.size > 0
  const showAnual = MONTHS_CONFIG.length > 1

  const allRows = useMemo(() => Object.values(monthData).flat(), [monthData])

  const currentRows = useMemo(
    () => (selectedGid === 'anual' ? allRows : (monthData[selectedGid] ?? [])),
    [selectedGid, allRows, monthData]
  )

  const filteredRows = useMemo(() => filtrar(currentRows, filters), [currentRows, filters])

  const kpis = useMemo(() => calcKPIs(filteredRows), [filteredRows])
  const agenciaData = useMemo(() => byAgencia(filteredRows), [filteredRows])
  const lineaNegocioData = useMemo(() => byLineaNegocio(filteredRows), [filteredRows])
  const comercialData = useMemo(() => byComercial(filteredRows), [filteredRows])
  const topClientesData = useMemo(() => topClientes(filteredRows), [filteredRows])
  const opciones = useMemo(() => getOpciones(currentRows), [currentRows])

  const selectedMonth = MONTHS_CONFIG.find(m => m.gid === selectedGid)
  const tabLabel = selectedGid === 'anual' ? 'Resumen Anual' : (selectedMonth?.label ?? '')

  const handleSelectMonth = (gid: string) => {
    setSelectedGid(gid)
    setFilters({ lineaNegocio: '__all__', comercial: '__all__' })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        months={MONTHS_CONFIG}
        selectedGid={selectedGid}
        onSelectMonth={handleSelectMonth}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
      />

      <main className="max-w-screen-2xl mx-auto px-4 py-6 space-y-5">
        {/* Error messages */}
        {Object.entries(errors).map(([gid, msg]) => {
          const month = MONTHS_CONFIG.find(m => m.gid === gid)
          return (
            <div key={gid} className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-sm">
                <p className="font-medium text-red-800">No se pudo cargar {month?.label ?? gid}</p>
                <p className="text-red-600 mt-0.5">{msg}</p>
              </div>
            </div>
          )
        })}

        {/* Filters bar */}
        <FiltersBar
          filters={filters}
          opciones={opciones}
          onChange={setFilters}
          label={tabLabel}
          totalRows={currentRows.filter(r => !r.esSinAsignar).length}
          filteredRows={filteredRows.filter(r => !r.esSinAsignar).length}
        />

        {/* KPI cards */}
        <KPICards kpis={kpis} isLoading={isLoading} />

        {/* Alerts */}
        <AlertsPanel alertas={kpis.alertas} />

        {/* Monthly trend (only in annual view with 2+ months) */}
        {selectedGid === 'anual' && showAnual && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <MonthlyTrendChart months={MONTHS_CONFIG} monthData={monthData} />
          </div>
        )}

        {/* Charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <AgencyBarChart data={agenciaData} />
          <LineaNegocioChart data={lineaNegocioData} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ComercialChart data={comercialData} />
          <TopClientsChart data={topClientesData} />
        </div>

        {/* Data table */}
        <DataTable rows={filteredRows} isLoading={isLoading} />

        {/* Footer */}
        <footer className="text-center text-xs text-slate-400 pb-6">
          Control de Gastos de Transporte · NATU ·{' '}
          {lastUpdated
            ? `Última actualización: ${lastUpdated.toLocaleString('es-ES')}`
            : 'Cargando...'}
        </footer>
      </main>
    </div>
  )
}
