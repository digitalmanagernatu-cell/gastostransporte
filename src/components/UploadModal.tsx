import { useEffect, useMemo, useState } from 'react'
import { AGENCIES } from '../config'
import { api, type ApiMonth, type BillingRowInput, type InvoiceLineInput } from '../utils/api'
import { buildMatcher, MONTH_NAMES, monthLabel } from '../utils/buildMonth'
import {
  readGrid, detectSapLayout, parseSap, parseAgencyInvoice, agencyFromFilename,
  SAP_FIELDS, detectPeriod, LINEAS, type Grid, type SapLayout, type SapField,
} from '../utils/parsers'

const PW_KEY = 'gt_upload_pw'
const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })

function readPw(): string {
  try { return sessionStorage.getItem(PW_KEY) ?? '' } catch { return '' }
}
function savePw(v: string) {
  try { v ? sessionStorage.setItem(PW_KEY, v) : sessionStorage.removeItem(PW_KEY) } catch { /* ignore */ }
}

interface Props {
  months: ApiMonth[]
  onChanged: () => Promise<void>
  onClose: () => void
}

type Tab = 'SAP' | (typeof AGENCIES)[number]

export default function UploadModal({ months, onChanged, onClose }: Props) {
  const [password, setPassword] = useState(readPw)
  const [authed, setAuthed] = useState(false)
  const [tab, setTab] = useState<Tab>('SAP')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Valida la contraseña guardada en esta pestaña del navegador
  useEffect(() => {
    if (!password) return
    api.checkPassword(password).then(() => setAuthed(true)).catch(() => { savePw(''); setPassword('') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Cargar mes</h2>
            <p className="text-xs text-slate-400">
              Sube la facturación SAP del mes y, cuando quieras, las facturas de cada agencia
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg">
            Cerrar
          </button>
        </div>

        {!authed ? (
          <Login onOk={pw => { savePw(pw); setPassword(pw); setAuthed(true) }} />
        ) : (
          <>
            <div className="flex flex-wrap gap-1 px-6 pt-4 border-b border-slate-200">
              {(['SAP', ...AGENCIES] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
                    tab === t ? 'border-teal-600 text-teal-700 bg-teal-50' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t === 'SAP' ? '📊 Facturación (SAP)' : t.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="p-6">
              {tab === 'SAP'
                ? <SapTab months={months} password={password} onChanged={onChanged} />
                : <AgencyTab key={tab} agency={tab} months={months} password={password} onChanged={onChanged} />}
            </div>
            <div className="px-6 pb-4 text-right">
              <button
                onClick={() => { savePw(''); setPassword(''); setAuthed(false) }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Cerrar sesión de carga
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Login({ onOk }: { onOk: (pw: string) => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await api.checkPassword(pw); onOk(pw) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="p-6 max-w-sm mx-auto space-y-3">
      <label className="block text-sm font-medium text-slate-700">Contraseña de carga</label>
      <input
        type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={!pw || busy} className="w-full bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg">
        {busy ? 'Comprobando…' : 'Entrar'}
      </button>
    </form>
  )
}

function Notice({ kind, children }: { kind: 'ok' | 'warn' | 'error'; children: React.ReactNode }) {
  const cls = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warn: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-red-50 border-red-200 text-red-700',
  }[kind]
  return <div className={`border rounded-lg px-3 py-2 text-sm ${cls}`}>{children}</div>
}

// ─── Facturación SAP ─────────────────────────────────────────────────────────

function SapTab({ months, password, onChanged }: { months: ApiMonth[]; password: string; onChanged: () => Promise<void> }) {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [year, setYear] = useState(prev.getFullYear())
  const [month, setMonth] = useState(prev.getMonth() + 1)
  const [file, setFile] = useState<File | null>(null)
  const [grid, setGrid] = useState<Grid | null>(null)
  const [layout, setLayout] = useState<SapLayout | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const existing = months.find(m => m.year === year && m.month === month)
  const rows: BillingRowInput[] = useMemo(() => (grid && layout ? parseSap(grid, layout) : []), [grid, layout])
  const stats = useMemo(() => {
    const clients = new Set(rows.map(r => r.client_code))
    const activos = new Set(rows.filter(r => r.base_imponible !== 0 || r.num_facturas > 0).map(r => r.client_code))
    const comerciales = [...new Set(rows.filter(r => r.base_imponible !== 0).map(r => r.comercial))].sort()
    const porLinea = new Map<string, { clientes: number; activos: number; ventas: number }>()
    for (const r of rows) {
      const l = porLinea.get(r.linea_negocio) ?? { clientes: 0, activos: 0, ventas: 0 }
      l.clientes++; l.ventas += r.base_imponible
      if (r.base_imponible !== 0 || r.num_facturas > 0) l.activos++
      porLinea.set(r.linea_negocio, l)
    }
    const lineas = [...porLinea.entries()].sort((a, b) =>
      (LINEAS as readonly string[]).indexOf(a[0]) - (LINEAS as readonly string[]).indexOf(b[0]))
    return { clients: clients.size, activos: activos.size, base: rows.reduce((s, r) => s + r.base_imponible, 0), comerciales, lineas }
  }, [rows])
  const missingRequired = layout ? SAP_FIELDS.filter(f => f.required && layout.mapping[f.key] < 0) : []

  const onFile = async (f: File | null) => {
    setFile(f); setGrid(null); setLayout(null); setMsg(null)
    if (!f) return
    try {
      const g = await readGrid(f)
      const l = detectSapLayout(g)
      setGrid(g); setLayout(l)
      const period = detectPeriod(l.headers)
      if (period) { setYear(period.year); setMonth(period.month) }
    } catch (e) { setMsg({ kind: 'error', text: `No se pudo leer el Excel: ${(e as Error).message}` }) }
  }

  const save = async () => {
    if (!file || rows.length === 0) return
    if (existing && !confirm(`${monthLabel(existing)} ya existe. Se reemplazará su facturación (las facturas de transporte se mantienen). ¿Continuar?`)) return
    setBusy(true); setMsg(null)
    try {
      const r = await api.upsertMonth(password, year, month, file.name, rows)
      await onChanged()
      setMsg({ kind: 'ok', text: `✅ ${monthLabel({ year, month })} guardado: ${r.rows} líneas de facturación. Ahora puedes subir las facturas de las agencias en sus pestañas.` })
      setFile(null); setGrid(null); setLayout(null)
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }) } finally { setBusy(false) }
  }

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Mes</span>
          <select value={month} onChange={e => setMonth(+e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Año</span>
          <select value={year} onChange={e => setYear(+e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="text-sm flex-1 min-w-[240px]">
          <span className="block text-slate-600 mb-1">Excel de facturación SAP</span>
          <input
            type="file" accept=".xlsx,.xls,.csv"
            onChange={e => onFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
        </label>
      </div>

      {existing && (
        <Notice kind="warn">
          {monthLabel(existing)} ya está cargado ({existing.billing_filename || 'sin nombre'} · {existing.invoices.length} facturas de transporte).
          Subir otro Excel reemplaza solo la facturación.
        </Notice>
      )}

      {layout && grid && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Columnas detectadas <span className="font-normal text-slate-400">(cámbialas si alguna no es correcta)</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {SAP_FIELDS.map(f => (
                <label key={f.key} className="text-xs">
                  <span className="block text-slate-500 mb-0.5">{f.label}{f.required && ' *'}</span>
                  <select
                    value={layout.mapping[f.key]}
                    onChange={e => setLayout({ ...layout, mapping: { ...layout.mapping, [f.key as SapField]: +e.target.value } })}
                    className={`w-full border rounded-lg px-2 py-1.5 text-sm ${f.required && layout.mapping[f.key] < 0 ? 'border-red-400' : 'border-slate-300'}`}
                  >
                    <option value={-1}>— No hay —</option>
                    {layout.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {missingRequired.length > 0 ? (
            <Notice kind="error">Falta indicar: {missingRequired.map(f => f.label).join(', ')}</Notice>
          ) : (
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 space-y-2">
              <p>
                <b>{stats.clients}</b> clientes en el Excel · <b>{stats.activos}</b> con ventas este mes ·
                ventas <b>{eur(stats.base)}</b>
              </p>
              <table className="text-xs w-full max-w-md">
                <thead className="text-slate-500">
                  <tr><th className="text-left font-medium">Línea de negocio</th><th className="text-right font-medium">Clientes</th><th className="text-right font-medium">Con ventas</th><th className="text-right font-medium">Ventas</th></tr>
                </thead>
                <tbody>
                  {stats.lineas.map(([l, v]) => (
                    <tr key={l} className={l === 'SIN COMERCIAL' ? 'text-amber-700' : ''}>
                      <td>{l}</td><td className="text-right">{v.clientes}</td><td className="text-right">{v.activos}</td><td className="text-right">{eur(v.ventas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-500">
                Comerciales con ventas ({stats.comerciales.length}): {stats.comerciales.join(', ') || '—'}
              </p>
            </div>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>{['Código', 'Cliente', 'Comercial', 'Línea', 'Ventas', 'Nº fact.'].map(h => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1">{r.client_code}</td>
                      <td className="px-2 py-1">{r.client_name}</td>
                      <td className="px-2 py-1">{r.comercial}</td>
                      <td className="px-2 py-1">{r.linea_negocio}</td>
                      <td className="px-2 py-1 text-right">{eur(r.base_imponible)}</td>
                      <td className="px-2 py-1 text-right">{r.num_facturas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-2 py-1 text-[11px] text-slate-400">Vista previa de las 5 primeras líneas</p>
            </div>
          )}
        </div>
      )}

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={busy || rows.length === 0 || missingRequired.length > 0}
          className="bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {busy ? 'Guardando…' : existing ? `Reemplazar facturación de ${monthLabel({ year, month })}` : `Crear ${monthLabel({ year, month })}`}
        </button>
      </div>

      {months.length > 0 && (
        <div className="pt-4 border-t border-slate-100">
          <p className="text-sm font-medium text-slate-700 mb-2">Meses cargados</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {[...months].reverse().map(m => (
              <li key={m.id} className="flex items-center justify-between py-2 gap-3">
                <div>
                  <span className="font-medium text-slate-800">{monthLabel(m)}</span>
                  <span className="text-xs text-slate-400 ml-2">
                    {new Set(m.billing.map(b => b.client_code)).size} clientes · {m.invoices.length} facturas de transporte
                  </span>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(`¿Borrar ${monthLabel(m)} entero (facturación y todas sus facturas de transporte)?`)) return
                    try { await api.deleteMonth(password, m.id); await onChanged() } catch (e) { alert((e as Error).message) }
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Borrar mes
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Facturas de una agencia ─────────────────────────────────────────────────

interface Pending {
  file: File
  lines: InvoiceLineInput[]
  invoiceNumber: string
  error?: string
  warnings: string[]
}

function AgencyTab({ agency, months, password, onChanged }: { agency: string; months: ApiMonth[]; password: string; onChanged: () => Promise<void> }) {
  const [monthId, setMonthId] = useState<number | null>(months.length ? months[months.length - 1].id : null)
  const [pending, setPending] = useState<Pending[]>([])
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [inputKey, setInputKey] = useState(0)

  const month = months.find(m => m.id === monthId) ?? null
  const match = useMemo(() => buildMatcher(month?.billing ?? []), [month])
  const uploaded = month?.invoices.filter(i => i.agency === agency) ?? []

  if (months.length === 0) {
    return <Notice kind="warn">Primero crea el mes en la pestaña «Facturación (SAP)». Las facturas de transporte se asignan a un mes ya creado.</Notice>
  }

  const onFiles = async (files: FileList | null) => {
    setMsg(null)
    const list = [...(files ?? [])]
    const out: Pending[] = []
    for (const file of list) {
      const warnings: string[] = []
      const guessed = agencyFromFilename(file.name)
      if (guessed && guessed !== agency) warnings.push(`El nombre del archivo parece de ${guessed}, no de ${agency}.`)
      if (uploaded.some(u => u.filename === file.name)) warnings.push('Ya subiste un archivo con este nombre a este mes. Si es el mismo, se duplicaría.')
      if (/\.pdf$/i.test(file.name)) {
        out.push({ file, lines: [], invoiceNumber: '', warnings, error: 'Los PDF todavía no se pueden leer. Sube el detalle en Excel o CSV.' })
        continue
      }
      try {
        const parsed = parseAgencyInvoice(agency, await readGrid(file))
        if (parsed.lines.length === 0) {
          out.push({ file, lines: [], invoiceNumber: '', warnings, error: 'No se encontraron líneas con importe. ¿Es la pestaña de agencia correcta?' })
        } else {
          out.push({ file, lines: parsed.lines, invoiceNumber: parsed.invoiceNumbers.join(', '), warnings })
        }
      } catch (e) {
        out.push({ file, lines: [], invoiceNumber: '', warnings, error: `No se pudo leer: ${(e as Error).message}` })
      }
    }
    setPending(out)
  }

  const valid = pending.filter(p => !p.error)

  const upload = async () => {
    if (!monthId || valid.length === 0) return
    setBusy(true); setMsg(null)
    const done: string[] = []
    try {
      for (const p of valid) {
        const r = await api.addInvoice(password, monthId, agency, p.file.name, p.invoiceNumber, p.lines)
        done.push(`${p.file.name} (${r.lines} líneas, ${eur(r.total)})`)
      }
      setMsg({ kind: 'ok', text: `✅ Subido a ${month ? monthLabel(month) : ''}: ${done.join(' · ')}` })
      setPending([]); setInputKey(k => k + 1)
    } catch (e) {
      setMsg({ kind: 'error', text: `${done.length ? `Subidos: ${done.join(', ')}. ` : ''}Error: ${(e as Error).message}` })
    } finally {
      await onChanged()
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Mes</span>
          <select
            value={monthId ?? ''}
            onChange={e => { setMonthId(+e.target.value); setPending([]); setInputKey(k => k + 1) }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {[...months].reverse().map(m => <option key={m.id} value={m.id}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <label className="text-sm flex-1 min-w-[240px]">
          <span className="block text-slate-600 mb-1">Facturas de {agency.replace('_', ' ')} (puedes elegir varias)</span>
          <input
            key={inputKey} type="file" multiple accept=".xlsx,.xls,.csv,.pdf"
            onChange={e => onFiles(e.target.files)}
            className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
        </label>
      </div>

      {pending.length > 0 && (
        <ul className="space-y-2">
          {pending.map((p, i) => {
            const total = p.lines.reduce((s, l) => s + l.amount, 0)
            const asignadas = p.lines.filter(l => match(l.client_code) ?? match(l.reference))
            const totalAsig = asignadas.reduce((s, l) => s + l.amount, 0)
            return (
              <li key={i} className="border border-slate-200 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-slate-800">{p.file.name}</p>
                {p.error ? (
                  <p className="text-red-600">{p.error}</p>
                ) : (
                  <p className="text-slate-600">
                    {p.lines.length} líneas · total <b>{eur(total)}</b> ·{' '}
                    <span className="text-emerald-700">{asignadas.length} asignadas a cliente ({eur(totalAsig)})</span> ·{' '}
                    <span className="text-amber-700">{p.lines.length - asignadas.length} sin asignar ({eur(total - totalAsig)})</span>
                    {p.invoiceNumber && <span className="text-slate-400"> · Factura {p.invoiceNumber}</span>}
                  </p>
                )}
                {p.warnings.map((w, j) => <p key={j} className="text-amber-700 text-xs">⚠️ {w}</p>)}
              </li>
            )
          })}
        </ul>
      )}

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="flex justify-end">
        <button
          onClick={upload}
          disabled={busy || valid.length === 0}
          className="bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {busy ? 'Subiendo…' : valid.length ? `Subir ${valid.length} ${valid.length === 1 ? 'factura' : 'facturas'} a ${month ? monthLabel(month) : ''}` : 'Subir facturas'}
        </button>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <p className="text-sm font-medium text-slate-700 mb-2">
          Facturas de {agency.replace('_', ' ')} en {month ? monthLabel(month) : ''}
        </p>
        {uploaded.length === 0 ? (
          <p className="text-sm text-slate-400">Ninguna todavía.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {uploaded.map(inv => (
              <li key={inv.id} className="flex items-center justify-between py-2 gap-3">
                <div className="min-w-0">
                  <p className="text-slate-800 truncate">{inv.filename}</p>
                  <p className="text-xs text-slate-400">
                    {inv.line_count} líneas · {eur(inv.total)}{inv.invoice_number ? ` · Factura ${inv.invoice_number}` : ''} · subida {fmtDate(inv.uploaded_at)}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(`¿Borrar ${inv.filename}?`)) return
                    try { await api.deleteInvoice(password, inv.id); await onChanged() } catch (e) { alert((e as Error).message) }
                  }}
                  className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
