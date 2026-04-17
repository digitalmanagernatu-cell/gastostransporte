import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { MonthConfig, ClientRow } from '../../types'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface Props {
  months: readonly MonthConfig[]
  monthData: Record<string, ClientRow[]>
}

export default function MonthlyTrendChart({ months, monthData }: Props) {
  const data = months.map(m => {
    const rows = monthData[m.gid] ?? []
    const asignados = rows.filter(r => !r.esSinAsignar)
    const totalTransporte = rows.reduce((s, r) => s + r.totalTransporte, 0)
    const totalFacturacion = asignados.reduce((s, r) => s + r.baseImponible, 0)
    return {
      mes: m.label,
      totalTransporte,
      totalFacturacion,
      pct: totalFacturacion > 0 ? parseFloat(((totalTransporte / totalFacturacion) * 100).toFixed(1)) : 0,
    }
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-teal-500 rounded-full" />
          Evolución Mensual — Facturación vs Transporte
        </h3>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={v => `${(v / 1000).toFixed(0)}k€`}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip
            formatter={(v: number, name: string) => [
              eur(v),
              name === 'totalFacturacion' ? 'Facturación' : 'Transporte',
            ]}
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '12px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            cursor={{ fill: '#f8fafc' }}
          />
          <Legend
            formatter={(value) => value === 'totalFacturacion' ? 'Facturación' : 'Transporte'}
            wrapperStyle={{ fontSize: '12px' }}
          />
          <Bar dataKey="totalFacturacion" fill="#bfdbfe" radius={[4, 4, 0, 0]} maxBarSize={80} />
          <Bar dataKey="totalTransporte" fill="#0d9488" radius={[4, 4, 0, 0]} maxBarSize={80} />
        </BarChart>
      </ResponsiveContainer>

      {/* % per month */}
      {data.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-4">
          {data.map(d => (
            <div key={d.mes} className="text-xs">
              <span className="text-slate-500">{d.mes}: </span>
              <span className={`font-semibold ${d.pct > 10 ? 'text-red-600' : 'text-teal-600'}`}>
                {d.pct.toFixed(1)}% s/facturación
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
