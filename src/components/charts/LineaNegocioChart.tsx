import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { LineaNegocioData } from '../../types'
import { LINEA_NEGOCIO_COLORS } from '../../config'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface Props {
  data: LineaNegocioData[]
}

export default function LineaNegocioChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.totalTransporte, 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
          Gasto por Línea de Negocio
        </h3>
        {total > 0 && (
          <span className="text-xs text-slate-400">{eur(total)} total</span>
        )}
      </div>

      {data.length === 0 ? (
        <div className="h-52 flex items-center justify-center text-slate-300 text-sm">
          Sin datos para mostrar
        </div>
      ) : (
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
                >
                  {data.map((entry, i) => (
                    <Cell
                      key={entry.lineaNegocio}
                      fill={LINEA_NEGOCIO_COLORS[i % LINEA_NEGOCIO_COLORS.length]}
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
              return (
                <div key={d.lineaNegocio} className="group">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: LINEA_NEGOCIO_COLORS[i % LINEA_NEGOCIO_COLORS.length] }}
                      />
                      <span className="font-medium text-slate-700 truncate">{d.lineaNegocio}</span>
                      <span className="text-slate-400 hidden group-hover:inline">({d.count} clientes)</span>
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
      )}
    </div>
  )
}
