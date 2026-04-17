import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Cell, Tooltip,
} from 'recharts'
import type { ClientRow } from '../../types'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface TooltipPayload {
  nombreCliente: string
  totalTransporte: number
  pctTransporte: number
  baseImponible: number
  lineaNegocio: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: { payload: TooltipPayload }[]
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-xs max-w-[200px]">
      <p className="font-semibold text-slate-800 mb-1.5 leading-tight">{d.nombreCliente}</p>
      <p className="text-slate-500">{d.lineaNegocio}</p>
      <div className="mt-1.5 space-y-0.5">
        <p className="text-slate-600">Transporte: <span className="font-medium text-slate-800">{eur(d.totalTransporte)}</span></p>
        <p className="text-slate-600">Facturación: <span className="font-medium text-slate-800">{eur(d.baseImponible)}</span></p>
        <p className={`font-semibold ${d.pctTransporte > 0.10 ? 'text-red-600' : 'text-teal-600'}`}>
          % s/facturación: {(d.pctTransporte * 100).toFixed(1)}%
        </p>
      </div>
    </div>
  )
}

interface Props {
  data: ClientRow[]
}

export default function TopClientsChart({ data }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
          Top Clientes por Gasto de Transporte
        </h3>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-amber-400 rounded-sm" />
            Normal
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-red-500 rounded-sm" />
            &gt;10%
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-52 flex items-center justify-center text-slate-300 text-sm">
          Sin datos para mostrar
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * 30)}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 10, left: 4, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="nombreCliente"
              tick={{ fontSize: 10, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              width={130}
              tickFormatter={v => v.length > 20 ? v.slice(0, 18) + '…' : v}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Bar dataKey="totalTransporte" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {data.map(entry => (
                <Cell
                  key={`${entry.codigoCliente}-${entry.nombreCliente}`}
                  fill={entry.pctTransporte > 0.10 ? '#ef4444' : '#f59e0b'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
