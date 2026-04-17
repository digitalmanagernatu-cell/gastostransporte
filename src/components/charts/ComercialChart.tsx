import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import type { ComercialData } from '../../types'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const COLORS = ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']

interface Props {
  data: ComercialData[]
}

export default function ComercialChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.totalTransporte, 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-violet-500 rounded-full" />
          Gasto por Comercial
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
          <ResponsiveContainer width="100%" height={Math.max(180, data.length * 42)}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 80, left: 4, bottom: 5 }}
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
                dataKey="comercial"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={90}
                tickFormatter={v => v.length > 14 ? v.slice(0, 13) + '…' : v}
              />
              <Tooltip
                formatter={(v: number) => [eur(v), 'Transporte']}
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
                cursor={{ fill: '#f8fafc' }}
              />
              <Bar dataKey="totalTransporte" radius={[0, 4, 4, 0]} maxBarSize={32}>
                {data.map((entry, i) => (
                  <Cell key={entry.comercial} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* % over billing per comercial */}
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-1.5">
            {data.map((d, i) => {
              const pct = d.totalFacturacion > 0 ? (d.totalTransporte / d.totalFacturacion) * 100 : 0
              return (
                <div key={d.comercial} className="flex items-center justify-between text-xs px-2 py-1 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-slate-600 truncate">{d.comercial}</span>
                  </div>
                  <span className={`font-medium ml-2 flex-shrink-0 ${pct > 10 ? 'text-red-500' : 'text-slate-400'}`}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
