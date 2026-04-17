import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { LineaNegocioData } from '../../types'
import { LINEA_NEGOCIO_COLORS } from '../../config'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface Props {
  data: LineaNegocioData[]
  selectedLinea?: string
  onSelectLinea?: (linea: string) => void
}

export default function LineaNegocioChart({ data, selectedLinea, onSelectLinea }: Props) {
  const total = data.reduce((s, d) => s + d.totalTransporte, 0)
  const hasSelection = !!selectedLinea && selectedLinea !== '__all__'

  const handleClick = (entry: unknown) => {
    const d = entry as LineaNegocioData
    onSelectLinea?.(d.lineaNegocio)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
          Gasto por Línea de Negocio
          {hasSelection && (
            <span className="text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              Filtrado
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="text-xs text-slate-400">{eur(total)} total</span>
          )}
          {hasSelection && (
            <button
              onClick={() => onSelectLinea?.('__all__')}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-52 flex items-center justify-center text-slate-300 text-sm">
          Sin datos para mostrar
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400 text-center mb-1">
            Clic en un sector para filtrar el dashboard
          </p>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="w-full md:w-auto flex-shrink-0">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="totalTransporte"
                    nameKey="lineaNegocio"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                    strokeWidth={0}
                    onClick={handleClick}
                    cursor="pointer"
                  >
                    {data.map((entry, i) => (
                      <Cell
                        key={entry.lineaNegocio}
                        fill={LINEA_NEGOCIO_COLORS[i % LINEA_NEGOCIO_COLORS.length]}
                        opacity={
                          !hasSelection || selectedLinea === entry.lineaNegocio ? 1 : 0.35
                        }
                        stroke={selectedLinea === entry.lineaNegocio ? '#1e40af' : 'none'}
                        strokeWidth={selectedLinea === entry.lineaNegocio ? 2 : 0}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [eur(v), 'Transporte']}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Custom legend */}
            <div className="flex-1 w-full space-y-2">
              {data.map((d, i) => {
                const pctTransp = total > 0 ? (d.totalTransporte / total) * 100 : 0
                const pctFact = d.totalFacturacion > 0 ? (d.totalTransporte / d.totalFacturacion) * 100 : 0
                const isSelected = selectedLinea === d.lineaNegocio
                return (
                  <div
                    key={d.lineaNegocio}
                    onClick={() => onSelectLinea?.(d.lineaNegocio)}
                    className={`group cursor-pointer rounded-lg px-2 py-1 transition-colors ${
                      isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50'
                    } ${hasSelection && !isSelected ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: LINEA_NEGOCIO_COLORS[i % LINEA_NEGOCIO_COLORS.length] }}
                        />
                        <span className="font-medium text-slate-700 truncate">{d.lineaNegocio}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                        <span className="font-semibold text-slate-800">{eur(d.totalTransporte)}</span>
                        <span className={`text-xs font-medium ${pctFact > 10 ? 'text-red-500' : 'text-slate-400'}`}>
                          {pctFact.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pctTransp}%`,
                          backgroundColor: LINEA_NEGOCIO_COLORS[i % LINEA_NEGOCIO_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
