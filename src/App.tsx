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
import TableModal from './components/TableModal'
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
  const [showTable, setShowTable] = useState(false)

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
  const opciones = useMemo(
    () => getOpciones(currentRows, filters.lineaNegocio),
    [currentRows, filters.lineaNegocio]
  )

  const selectedMonth = MONTHS_CONFIG.find(m => m.gid === selectedGid)
  const tabLabel = selectedGid === 'anual' ? 'Total Acumulado Año' : (selectedMonth?.label ?? '')

  const handleSelectMonth = (gid: string) => {
    setSelectedGid(gid)
    setFilters({ lineaNegocio: '__all__', comercial: '__all__' })
  }

  const handleFiltersChange = (newFilters: DashboardFilters) => {
    if (newFilters.lineaNegocio !== filters.lineaNegocio) {
      // Si cambia la línea, resetear comercial si ya no pertenece a ella
      const newOpciones = getOpciones(currentRows, newFilters.lineaNegocio)
      if (newFilters.comercial !== '__all__' && !newOpciones.comerciales.includes(newFilters.comercial)) {
        setFilters({ ...newFilters, comercial: '__all__' })
        return
      }
    }
    setFilters(newFilters)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        months={MONTHS_CONFIG}
        selectedGid={selectedGid}
        onSelectMonth={handleSelectMonth}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
        onShowTable={() => setShowTable(true)}
      />

      <main className="max-w-screen-2xl mx-auto px-4 py-6 space-y-5">
        {/* Errors */}
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

        {/* Filters */}
        <FiltersBar
          filters={filters}
          opciones={opciones}
          onChange={handleFiltersChange}
          label={tabLabel}
          totalRows={currentRows.filter(r => !r.esSinAsignar).length}
          filteredRows={filteredRows.filter(r => !r.esSinAsignar).length}
        />

        {/* KPIs */}
        <KPICards kpis={kpis} isLoading={isLoading} />

        {/* Monthly trend (annual view) */}
        {selectedGid === 'anual' && MONTHS_CONFIG.length > 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <MonthlyTrendChart months={MONTHS_CONFIG} monthData={monthData} />
          </div>
        )}

        {/* Charts — row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <AgencyBarChart data={agenciaData} />
          <LineaNegocioChart data={lineaNegocioData} />
        </div>

        {/* Charts — row 2: comercial smaller (1/3) + top clients (2/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1">
            <ComercialChart data={comercialData} />
          </div>
          <div className="lg:col-span-2">
            <TopClientsChart data={topClientesData} />
          </div>
        </div>

        {/* Alerts */}
        <AlertsPanel alertas={kpis.alertas} />

        {/* Footer */}
        <footer className="text-center text-xs text-slate-400 pb-6">
          Control de Gastos de Transporte · NATU ·{' '}
          {lastUpdated
            ? `Última actualización: ${lastUpdated.toLocaleString('es-ES')}`
            : 'Cargando...'}
        </footer>
      </main>

      {/* Table modal */}
      {showTable && (
        <TableModal
          rows={filteredRows}
          isLoading={isLoading}
          onClose={() => setShowTable(false)}
        />
      )}
    </div>
  )
}
