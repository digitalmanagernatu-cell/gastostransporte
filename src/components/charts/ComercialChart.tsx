import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import type { ComercialData } from '../../types'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const shortEur = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k€` : `${v}€`

const COLORS = ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']
const TOP_N = 5

interface CustomTooltipProps {
  active?: boolean
  payload?: { payload: ComercialData }[]
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const pct = d.totalFacturacion > 0 ? (d.totalTransporte / d.totalFacturacion) * 100 : 0
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-xs min-w-[190px]">
      <p className="font-semibold text-slate-800 mb-2 pb-1.5 border-b border-slate-100">{d.comercial}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Total facturado</span>
          <span className="font-medium text-slate-800">{eur(d.totalFacturacion)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Gastos transporte</span>
          <span className="font-medium text-slate-800">{eur(d.totalTransporte)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Clientes</span>
          <span className="font-medium text-slate-800">{d.count}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-slate-100">
          <span className="font-semibold text-slate-700">% Transp./Fact.</span>
          <span className={`font-bold ${pct > 10 ? 'text-red-600' : 'text-teal-600'}`}>
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}

interface Props {
  data: ComercialData[]
}

export default function ComercialChart({ data }: Props) {
  const [selected, setSelected] = useState('__all__')

  const top5 = data.slice(0, TOP_N)
  const displayData = selected === '__all__'
    ? top5
    : data.filter(d => d.comercial === selected)

  const total = displayData.reduce((s, d) => s + d.totalTransporte, 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-full flex flex-col">
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-violet-500 rounded-full flex-shrink-0" />
          Gastos de Transporte por Comercial
        </h3>
      </div>

      {/* Internal filter */}
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-slate-400 whitespace-nowrap">Comercial:</label>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
        >
          <option value="__all__">Top {Math.min(TOP_N, data.length)}</option>
          {data.map(d => (
            <option key={d.comercial} value={d.comercial}>{d.comercial}</option>
          ))}
        </select>
        {total > 0 && (
          <span className="text-xs text-slate-400 whitespace-nowrap">{shortEur(total)}</span>
        )}
      </div>

      {displayData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">
          Sin datos
        </div>
      ) : (
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={Math.max(120, displayData.length * 44)}>
            <BarChart
              data={displayData}
              layout="vertical"
              margin={{ top: 5, right: 70, left: 4, bottom: 5 }}
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
                width={85}
                tickFormatter={v => v.length > 13 ? v.slice(0, 11) + '…' : v}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="totalTransporte" radius={[0, 4, 4, 0]} maxBarSize={30}>
                <LabelList
                  dataKey="totalTransporte"
                  position="right"
                  formatter={(v: number) => shortEur(v)}
                  style={{ fontSize: '10px', fill: '#475569', fontWeight: 600 }}
                />
                {displayData.map((entry, i) => (
                  <Cell key={entry.comercial} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* % sobre facturación */}
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
            {displayData.map((d, i) => {
              const pct = d.totalFacturacion > 0 ? (d.totalTransporte / d.totalFacturacion) * 100 : 0
              return (
                <div key={d.comercial} className="flex items-center justify-between text-xs px-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-slate-500 truncate">{d.comercial}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400">{d.count} clientes</span>
                  </div>
                  <span className={`font-semibold ml-2 flex-shrink-0 ${pct > 10 ? 'text-red-500' : 'text-slate-400'}`}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
