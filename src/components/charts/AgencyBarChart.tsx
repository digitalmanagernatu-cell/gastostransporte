import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import type { AgenciaData } from '../../types'
import { AGENCY_COLORS } from '../../config'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const shortEur = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k€` : `${v}€`

interface TooltipEntry {
  agencia: string
  total: number
  clientes: number
  natu: number
}

interface CustomTooltipProps {
  active?: boolean
  payload?: { payload: TooltipEntry }[]
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-xs min-w-[190px]">
      <p className="font-semibold text-slate-800 mb-2 pb-1.5 border-b border-slate-100">{d.agencia}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Gastos clientes</span>
          <span className="font-medium text-slate-800">{eur(d.clientes)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Gastos NATU</span>
          <span className="font-medium text-slate-800">{eur(d.natu)}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-slate-100">
          <span className="font-semibold text-slate-700">Total</span>
          <span className="font-bold text-slate-900">{eur(d.total)}</span>
        </div>
      </div>
    </div>
  )
}

interface Props {
  data: AgenciaData[]
}

export default function AgencyBarChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.total, 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-teal-500 rounded-full" />
          Gasto de Transporte por Agencia
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
        <>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 24, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="agencia"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={35}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={60}>
                <LabelList
                  dataKey="total"
                  position="top"
                  formatter={(v: number) => shortEur(v)}
                  style={{ fontSize: '9px', fill: '#475569', fontWeight: 600 }}
                />
                {data.map(entry => (
                  <Cell key={entry.agencia} fill={AGENCY_COLORS[entry.agencia] ?? '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Mini legend */}
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {data.map(d => (
              <div key={d.agencia} className="flex items-center justify-between text-xs px-2 py-1 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: AGENCY_COLORS[d.agencia] ?? '#94a3b8' }}
                  />
                  <span className="text-slate-600 font-medium truncate">{d.agencia}</span>
                </div>
                <span className="text-slate-400 flex-shrink-0 ml-2">
                  {total > 0 ? ((d.total / total) * 100).toFixed(0) + '%' : '0%'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
