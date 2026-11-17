import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { AGENCIES, SHAREPOINT_FN_URL, agencyLabel } from '../config'
import { api, type ApiMonth } from '../utils/api'
import { MONTH_NAMES, monthLabel } from '../utils/buildMonth'
import { analyzeFolder, matchStats, otrosLines, type FolderFile, type Proposal } from '../utils/folderImport'
import { parseAgencyInvoice, type Grid } from '../utils/parsers'
import { extractPdf, loadBrowserPdfjs } from '../utils/pdfText'

const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

async function callFn(body: object): Promise<Response> {
  const res = await fetch(SHAREPOINT_FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const j = await res.json().catch(() => null)
    throw new Error(j?.error ?? `Error ${res.status}`)
  }
  return res
}

const readExcel = (d: ArrayBuffer): Grid => {
  const wb = XLSX.read(d, { type: 'array' })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '', blankrows: false }) as Grid
}

/** «9. FACTURAS SEPTIEMBRE 2026 / GASTOS / TRANSPORTES» → { month: 9, year: 2026 } */
function periodFromFolder(name: string) {
  const t = name.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const i = MONTH_NAMES.findIndex(m => t.includes(m.toUpperCase()))
  const y = t.match(/20\d{2}/)
  return i >= 0 && y ? { month: i + 1, year: +y[0] } : null
}

interface Props { months: ApiMonth[]; password: string; onChanged: () => Promise<void> }

export default function FolderImportTab({ months, password, onChanged }: Props) {
  const [url, setUrl] = useState('')
  const [monthId, setMonthId] = useState<number | null>(months.length ? months[months.length - 1].id : null)
  const [phase, setPhase] = useState<'idle' | 'working' | 'ready' | 'saving'>('idle')
  const [progress, setProgress] = useState('')
  const [folder, setFolder] = useState('')
  const [props, setProps] = useState<Proposal[]>([])
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const cache = useRef(new Map<string, ArrayBuffer>())

  const month = months.find(m => m.id === monthId) ?? null

  if (months.length === 0) {
    return <div className="border rounded-lg px-3 py-2 text-sm bg-amber-50 border-amber-200 text-amber-800">Primero crea el mes en la pestaña «Facturación (SAP)».</div>
  }

  const review = async () => {
    setMsg(null); setProps([]); setPhase('working'); cache.current.clear()
    try {
      setProgress('Abriendo la carpeta…')
      const list = await (await callFn({ action: 'list', url: url.trim(), password })).json() as { folder: string; files: FolderFile[] }
      setFolder(list.folder)
      let target = month
      const per = periodFromFolder(list.folder)
      if (per) {
        const m = months.find(x => x.year === per.year && x.month === per.month)
        if (m) { target = m; setMonthId(m.id) }
        else throw new Error(`La carpeta es de ${MONTH_NAMES[per.month - 1]} ${per.year}, pero ese mes no está creado. Súbelo primero en «Facturación (SAP)».`)
      }
      if (!target) throw new Error('Elige el mes')
      const pdfjs = await loadBrowserPdfjs()
      const res = await analyzeFolder(list.files, target.billing, target.invoices, {
        fetchFile: async f => {
          const buf = await (await callFn({ action: 'file', url: url.trim(), password, path: f.path })).arrayBuffer()
          cache.current.set(f.path, buf)
          return buf
        },
        readExcel,
        readPdf: d => extractPdf(d.slice(0), pdfjs),
        onProgress: (d, t, n) => setProgress(`Leyendo ${d + 1} de ${t}: ${n}`),
      })
      setProps(res)
      setPhase('ready')
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message }); setPhase('idle')
    }
  }

  const update = (i: number, patch: Partial<Proposal>) => setProps(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const changeAgency = (i: number, agency: string) => {
    const p = props[i]
    if (agency === 'OTROS') { update(i, { agency, lines: [], supplier: p.supplier || p.file.name.replace(/\.[^.]+$/, ''), action: p.amount ? 'cargar' : 'revisar' }); return }
    const data = cache.current.get(p.file.path)
    if (p.kind === 'excel' && data) {
      const lines = parseAgencyInvoice(agency, readExcel(data)).lines
      update(i, { agency, lines, amount: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100, action: lines.length ? 'cargar' : 'revisar',
        reason: lines.length ? 'Excel con detalle por cliente' : 'No se encontraron líneas con importe' })
    } else update(i, { agency })
  }

  const canLoad = (p: Proposal) => p.agency === 'OTROS' ? !!p.supplier.trim() && p.amount !== null && p.amount !== 0 : p.lines.length > 0 && !!p.agency
  const toLoad = props.filter(p => p.action === 'cargar' && canLoad(p))
  // Códigos de cliente de las facturas que no están en el SAP del mes (export incompleto)
  const sapCodes = new Set((month?.billing ?? []).map(b => b.client_code.replace(/[\s\-./#]/g, '').toUpperCase()))
  const missing = new Map<string, number>()
  for (const p of toLoad) if (p.agency !== 'OTROS') for (const l of p.lines) {
    const c = (l.client_code ?? '').replace(/[\s\-./#]/g, '').toUpperCase()
    if (/^CF?\d{3,}$/.test(c) && !sapCodes.has(c)) missing.set(c, (missing.get(c) ?? 0) + l.amount)
  }
  const missingTotal = [...missing.values()].reduce((s, v) => s + v, 0)
  const totals = { ag: 0, ot: 0 }
  for (const p of toLoad) { if (p.agency === 'OTROS') totals.ot += p.amount ?? 0; else totals.ag += p.amount ?? 0 }

  const save = async () => {
    if (!month) return
    setPhase('saving'); setMsg(null)
    const ok: string[] = []
    try {
      for (const p of toLoad) {
        setProgress(`Guardando ${ok.length + 1} de ${toLoad.length}: ${p.file.name}`)
        await api.addInvoice(password, month.id, p.agency, p.file.path, p.invoiceNumber, p.agency === 'OTROS' ? otrosLines(p) : p.lines)
        ok.push(p.file.name)
      }
      setMsg({ kind: 'ok', text: `✅ ${ok.length} facturas cargadas en ${monthLabel(month)}.` })
      setProps([]); setPhase('idle')
    } catch (e) {
      setMsg({ kind: 'error', text: `${ok.length ? `Se cargaron ${ok.length}. ` : ''}Error: ${(e as Error).message}` }); setPhase('ready')
    } finally {
      await onChanged()
    }
  }

  const rowCls = (p: Proposal) => p.action === 'descartar' ? 'bg-slate-50 text-slate-400' : p.action === 'revisar' || !canLoad(p) ? 'bg-amber-50' : ''
  const input = 'border border-slate-300 rounded px-1.5 py-1 text-xs'

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Pega el enlace de la carpeta de facturas de transporte del mes (compartida como <b>«Cualquier persona con el vínculo»</b>).
        El sistema lee todos los archivos, quita duplicados y te propone qué cargar. <b>No se guarda nada hasta que pulses «Cargar».</b>
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm flex-1 min-w-[260px]">
          <span className="block text-slate-600 mb-1">Enlace de SharePoint</span>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://natuaromatic-my.sharepoint.com/…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Mes</span>
          <select value={monthId ?? ''} onChange={e => setMonthId(+e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {[...months].reverse().map(m => <option key={m.id} value={m.id}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <button onClick={review} disabled={!url.trim() || phase === 'working' || phase === 'saving'}
          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
          {phase === 'working' ? 'Revisando…' : 'Revisar carpeta'}
        </button>
      </div>

      {(phase === 'working' || phase === 'saving') && <p className="text-sm text-slate-500 animate-pulse">{progress}</p>}
      {msg && <div className={`border rounded-lg px-3 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : msg.kind === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      {phase !== 'idle' && props.length > 0 && (
        <>
          <p className="text-xs text-slate-500">
            Carpeta <b>{folder}</b> · {props.length} archivos · se cargará en <b>{month ? monthLabel(month) : ''}</b>.
            Las filas en ámbar necesitan que las revises; las grises se descartan.
          </p>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-2 py-2">Acción</th>
                  <th className="px-2 py-2">Archivo</th>
                  <th className="px-2 py-2">Agencia</th>
                  <th className="px-2 py-2">Nº factura</th>
                  <th className="px-2 py-2 text-right">Importe sin IVA</th>
                  <th className="px-2 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {props.map((p, i) => {
                  const st = p.agency !== 'OTROS' && p.lines.length && month ? matchStats(p, month.billing) : null
                  return (
                    <tr key={p.file.path} className={`border-t border-slate-100 align-top ${rowCls(p)}`}>
                      <td className="px-2 py-1.5">
                        <select value={p.action} onChange={e => update(i, { action: e.target.value as Proposal['action'] })} className={input}>
                          <option value="cargar">Cargar</option>
                          <option value="revisar">Revisar</option>
                          <option value="descartar">Descartar</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5 max-w-[220px]"><span className="block truncate text-slate-700" title={p.file.path}>{p.file.path}</span></td>
                      <td className="px-2 py-1.5">
                        {p.kind === 'otro' ? '—' : (
                          <select value={p.agency} onChange={e => changeAgency(i, e.target.value)} className={input}>
                            <option value="">¿?</option>
                            {AGENCIES.map(a => <option key={a} value={a}>{agencyLabel(a)}</option>)}
                          </select>
                        )}
                        {p.agency === 'OTROS' && (
                          <input value={p.supplier} onChange={e => update(i, { supplier: e.target.value })} placeholder="Proveedor" className={`${input} mt-1 block w-36`} />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={p.invoiceNumber} onChange={e => update(i, { invoiceNumber: e.target.value })} className={`${input} w-28`} />
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        {p.agency === 'OTROS' ? (
                          <input inputMode="decimal" defaultValue={p.amount ?? ''} key={`${p.file.path}-${p.amount}`}
                            onBlur={e => {
                              const v = parseFloat(e.target.value.replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
                              update(i, { amount: Number.isFinite(v) ? Math.round(v * 100) / 100 : null, action: Number.isFinite(v) && v !== 0 ? 'cargar' : p.action })
                            }}
                            placeholder="0,00" className={`${input} w-24 text-right`} />
                        ) : p.amount !== null ? <b>{eur(p.amount)}</b> : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-slate-500">
                        <p>{p.reason}</p>
                        {st && <p><span className="text-emerald-700">asignado {eur(st.asignado)}</span> · <span className="text-amber-700">sin asignar {eur(st.sinAsignar)}</span> · {p.lines.length} líneas</p>}
                        {p.notes.map((n, j) => <p key={j}>{n}</p>)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {missing.size > 0 && (
            <div className={`border rounded-lg px-3 py-2 text-sm ${missingTotal > 500 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              {missing.size} códigos de cliente de estas facturas no están en el SAP de {month ? monthLabel(month) : ''} ({eur(missingTotal)}):{' '}
              {[...missing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, v]) => `${c} (${eur(v)})`).join(', ')}
              {missingTotal > 500 ? '. Si son muchos, revisa que el Excel de SAP se exportara sin filtros.' : '. Suelen ser códigos mal escritos por la agencia.'}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              Se cargarán <b>{toLoad.length}</b> facturas: agencias <b>{eur(totals.ag)}</b> · otros transportistas <b>{eur(totals.ot)}</b> ·
              total <b>{eur(totals.ag + totals.ot)}</b>
            </p>
            <button onClick={save} disabled={phase === 'saving' || toLoad.length === 0}
              className="bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {phase === 'saving' ? 'Guardando…' : `Cargar ${toLoad.length} facturas en ${month ? monthLabel(month) : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
