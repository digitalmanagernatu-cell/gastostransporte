import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import { api, type ApiMonth } from './utils/api'
import { buildClientMemory, buildMonthRows, toMonthConfig } from './utils/buildMonth'
import {
  filtrar, calcKPIs, byAgencia, byLineaNegocio,
  byComercial, topClientes, getOpciones,
} from './utils/dataUtils'
import type { ClientRow, DashboardFilters, MonthConfig } from './types'
import type { TransportRangeKey } from './config'
import Header from './components/Header'
import FiltersBar from './components/FiltersBar'
import KPICards from './components/KPICards'
import ClientHealthCard from './components/ClientHealthCard'
import AlertsPanel from './components/AlertsPanel'
import TableModal from './components/TableModal'
import AgencyBarChart from './components/charts/AgencyBarChart'
import LineaNegocioChart from './components/charts/LineaNegocioChart'
import ComercialChart from './components/charts/ComercialChart'
import TopClientsChart from './components/charts/TopClientsChart'
import MonthlyTrendChart from './components/charts/MonthlyTrendChart'

const UploadModal = lazy(() => import('./components/UploadModal'))

export default function App() {
  const [apiMonths, setApiMonths] = useState<ApiMonth[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedGid, setSelectedGid] = useState<string>('anual')
  const [filters, setFilters] = useState<DashboardFilters>({
    lineaNegocio: '__all__',
    comercial: '__all__',
    includeSinAsignar: true,
  })
  const [showTable, setShowTable] = useState(false)
  const [tableTargetClient, setTableTargetClient] = useState<string | null>(null)
  const [tableInitialRange, setTableInitialRange] = useState<TransportRangeKey | null>(null)
  const [tableInitialSinAsignar, setTableInitialSinAsignar] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await api.getDashboard()
      setApiMonths(data)
      setLoadError(null)
      setLastUpdated(new Date())
      return data
    } catch (err) {
      setLoadError((err as Error).message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData().then(data => {
      if (data && data.length > 0) setSelectedGid(String(data[data.length - 1].id))
    })
  }, [loadData])

  const months: MonthConfig[] = useMemo(() => apiMonths.map(toMonthConfig), [apiMonths])
  const monthData = useMemo(
    () => {
      const memory = buildClientMemory(apiMonths)
      return Object.fromEntries(apiMonths.map(m => [String(m.id), buildMonthRows(m, memory)])) as Record<string, ClientRow[]>
    },
    [apiMonths]
  )

  // Si el mes seleccionado desaparece (p. ej. se borró), vuelve al acumulado
  useEffect(() => {
    if (selectedGid !== 'anual' && !isLoading && !monthData[selectedGid]) setSelectedGid('anual')
  }, [selectedGid, monthData, isLoading])

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

  const selectedMonth = months.find(m => m.gid === selectedGid)
  const tabLabel = selectedGid === 'anual' ? 'Total Acumulado Año' : (selectedMonth?.label ?? '')

  const handleSelectMonth = (gid: string) => {
    setSelectedGid(gid)
    setFilters({ lineaNegocio: '__all__', comercial: '__all__', includeSinAsignar: true })
  }

  const handleFiltersChange = (newFilters: DashboardFilters) => {
    if (newFilters.lineaNegocio !== filters.lineaNegocio) {
      const newOpciones = getOpciones(currentRows, newFilters.lineaNegocio)
      if (newFilters.comercial !== '__all__' && !newOpciones.comerciales.includes(newFilters.comercial)) {
        setFilters({ ...newFilters, comercial: '__all__' })
        return
      }
    }
    setFilters(newFilters)
  }

  const handleSelectLineaNegocio = (linea: string) => {
    const newLinea = filters.lineaNegocio === linea ? '__all__' : linea
    handleFiltersChange({ ...filters, lineaNegocio: newLinea })
  }

  const openTableForClient = (codigoCliente: string) => {
    setTableTargetClient(codigoCliente)
    setTableInitialRange(null)
    setTableInitialSinAsignar(false)
    setShowTable(true)
  }

  const openTableForRange = (key: TransportRangeKey) => {
    setTableTargetClient(null)
    setTableInitialRange(key)
    setTableInitialSinAsignar(false)
    setShowTable(true)
  }

  const openTableForSinAsignar = () => {
    setTableTargetClient(null)
    setTableInitialRange(null)
    setTableInitialSinAsignar(true)
    setShowTable(true)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        months={months}
        selectedGid={selectedGid}
        onSelectMonth={handleSelectMonth}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
        onShowTable={() => setShowTable(true)}
        onShowUpload={() => setShowUpload(true)}
      />

      <main className="max-w-screen-2xl mx-auto px-4 py-6 space-y-5">
        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
            <p className="font-medium text-red-800">No se pudieron cargar los datos</p>
            <p className="text-red-600 mt-0.5">{loadError}</p>
          </div>
        )}

        {!isLoading && !loadError && months.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-600">
            <p className="font-medium text-slate-800">Todavía no hay meses cargados</p>
            <p className="mt-1">
              Pulsa <b>Cargar mes</b>, elige mes y año y sube el Excel de facturación SAP.
              Después podrás ir añadiendo las facturas de cada agencia.
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-3 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              Cargar mes
            </button>
          </div>
        )}

        {/* Filters */}
        <FiltersBar
          filters={filters}
          opciones={opciones}
          onChange={handleFiltersChange}
          label={tabLabel}
          totalRows={currentRows.filter(r => !r.esSinAsignar).length}
          filteredRows={filteredRows.filter(r => !r.esSinAsignar).length}
          onViewSinAsignar={openTableForSinAsignar}
        />

        {/* KPIs */}
        <KPICards kpis={kpis} isLoading={isLoading} />

        {/* Client health ranges */}
        <ClientHealthCard rows={filteredRows} onSelectRange={openTableForRange} />

        {/* Monthly trend (annual view) */}
        {selectedGid === 'anual' && months.length > 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <MonthlyTrendChart months={months} monthData={monthData} />
          </div>
        )}

        {/* Charts — row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <AgencyBarChart data={agenciaData} />
          <LineaNegocioChart
            data={lineaNegocioData}
            selectedLinea={filters.lineaNegocio}
            onSelectLinea={handleSelectLineaNegocio}
          />
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
        <AlertsPanel alertas={kpis.alertas} onClientClick={openTableForClient} />

        {/* Footer */}
        <footer className="text-center pb-8 space-y-1">
          <p className="text-xs text-slate-400">
            Control de Gastos de Transporte · NATU ·{' '}
            {lastUpdated
              ? `Última actualización: ${lastUpdated.toLocaleString('es-ES')}`
              : 'Cargando...'}
          </p>
          <p className="text-xs text-slate-300 font-medium tracking-wide">
            By Digital Manager
          </p>
        </footer>
      </main>

      {showUpload && (
        <Suspense fallback={null}>
          <UploadModal
            months={apiMonths}
            onChanged={async () => { await loadData() }}
            onClose={() => setShowUpload(false)}
          />
        </Suspense>
      )}

      {/* Table modal */}
      {showTable && (
        <TableModal
          rows={currentRows}
          isLoading={isLoading}
          onClose={() => {
            setShowTable(false)
            setTableTargetClient(null)
            setTableInitialRange(null)
            setTableInitialSinAsignar(false)
          }}
          targetClient={tableTargetClient}
          initialRange={tableInitialRange}
          initialSinAsignar={tableInitialSinAsignar}
        />
      )}
    </div>
  )
}
