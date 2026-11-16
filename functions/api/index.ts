// API de Control de Gastos de Transporte (Neon Function).
// DATABASE_URL lo inyecta Neon. UPLOAD_PASSWORD protege las escrituras.
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
pool.on('error', err => console.error('pg pool error', err))

const ALLOWED_ORIGINS = [
  'https://digitalmanagernatu-cell.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]
const AGENCIES = ['SEUR', 'PALEMANIA', 'TRANSAHER', 'REDUR', 'NACEX', 'DHL', 'DHL_EXPORT', 'CORREOS']

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Password',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

function requireAuth(req: Request) {
  const expected = process.env.UPLOAD_PASSWORD
  if (!expected) throw new HttpError(500, 'UPLOAD_PASSWORD no configurada en la función')
  if (req.headers.get('x-upload-password') !== expected) throw new HttpError(401, 'Contraseña incorrecta')
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

async function readJson(req: Request): Promise<any> {
  try { return await req.json() } catch { throw new HttpError(400, 'JSON inválido') }
}

// GET /data → todos los meses con facturación, facturas y líneas agregadas
async function getData() {
  const [months, billing, invoices, lines] = await Promise.all([
    pool.query('SELECT id, year, month, billing_filename, updated_at FROM months ORDER BY year, month'),
    pool.query(`SELECT month_id, client_code, client_name, comercial, linea_negocio,
                       base_imponible::float8 AS base_imponible, num_facturas
                FROM billing_rows ORDER BY month_id, id`),
    pool.query(`SELECT i.id, i.month_id, i.agency, i.filename, i.invoice_number, i.total::float8 AS total,
                       i.uploaded_at, COUNT(l.id)::int AS line_count
                FROM invoices i LEFT JOIN invoice_lines l ON l.invoice_id = i.id
                GROUP BY i.id ORDER BY i.uploaded_at`),
    pool.query(`SELECT i.month_id, i.agency, l.client_code, l.reference, SUM(l.amount)::float8 AS amount
                FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
                GROUP BY i.month_id, i.agency, l.client_code, l.reference`),
  ])
  return months.rows.map(m => ({
    ...m,
    billing: billing.rows.filter(b => b.month_id === m.id),
    invoices: invoices.rows.filter(i => i.month_id === m.id),
    lines: lines.rows.filter(l => l.month_id === m.id),
  }))
}

// PUT /months  { year, month, filename, rows[] } → crea el mes o reemplaza su facturación
async function putMonth(body: any) {
  const year = Math.trunc(num(body.year))
  const month = Math.trunc(num(body.month))
  if (year < 2000 || year > 2100 || month < 1 || month > 12) throw new HttpError(400, 'Mes o año no válido')
  const rows: any[] = Array.isArray(body.rows) ? body.rows : []
  if (rows.length === 0) throw new HttpError(400, 'El Excel de facturación no tiene filas')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [m] } = await client.query(
      `INSERT INTO months (year, month, billing_filename) VALUES ($1, $2, $3)
       ON CONFLICT (year, month) DO UPDATE SET billing_filename = EXCLUDED.billing_filename, updated_at = now()
       RETURNING id`,
      [year, month, str(body.filename)],
    )
    await client.query('DELETE FROM billing_rows WHERE month_id = $1', [m.id])
    for (let i = 0; i < rows.length; i += 500) {
      const values: unknown[] = []
      const tuples = rows.slice(i, i + 500).map((r, j) => {
        values.push(m.id, str(r.client_code), str(r.client_name) || str(r.client_code), str(r.comercial),
          str(r.linea_negocio), num(r.base_imponible), Math.trunc(num(r.num_facturas)))
        const b = j * 7
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`
      })
      await client.query(
        `INSERT INTO billing_rows (month_id, client_code, client_name, comercial, linea_negocio, base_imponible, num_facturas)
         VALUES ${tuples.join(',')}`,
        values,
      )
    }
    await client.query('COMMIT')
    return { id: m.id, rows: rows.length }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// POST /months/:id/invoices  { agency, filename, invoice_number, lines[] }
async function postInvoice(monthId: number, body: any) {
  const agency = str(body.agency).toUpperCase()
  if (!AGENCIES.includes(agency)) throw new HttpError(400, `Agencia no válida: ${agency}`)
  const lines: any[] = (Array.isArray(body.lines) ? body.lines : []).filter((l: any) => num(l.amount) !== 0)
  if (lines.length === 0) throw new HttpError(400, 'La factura no tiene líneas con importe')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const exists = await client.query('SELECT 1 FROM months WHERE id = $1', [monthId])
    if (exists.rowCount === 0) throw new HttpError(404, 'El mes no existe')
    const total = lines.reduce((s, l) => s + num(l.amount), 0)
    const { rows: [inv] } = await client.query(
      'INSERT INTO invoices (month_id, agency, filename, invoice_number, total) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [monthId, agency, str(body.filename), str(body.invoice_number) || null, total],
    )
    for (let i = 0; i < lines.length; i += 1000) {
      const values: unknown[] = []
      const tuples = lines.slice(i, i + 1000).map((l, j) => {
        values.push(inv.id, str(l.client_code) || null, str(l.reference), num(l.amount))
        const b = j * 4
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`
      })
      await client.query(
        `INSERT INTO invoice_lines (invoice_id, client_code, reference, amount) VALUES ${tuples.join(',')}`,
        values,
      )
    }
    await client.query('UPDATE months SET updated_at = now() WHERE id = $1', [monthId])
    await client.query('COMMIT')
    return { id: inv.id, lines: lines.length, total }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function route(req: Request): Promise<unknown> {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean)
  const method = req.method

  if (method === 'GET' && (parts.length === 0 || parts[0] === 'health')) return { ok: true }
  if (method === 'GET' && parts[0] === 'data') return getData()
  if (method === 'POST' && parts[0] === 'login') { requireAuth(req); return { ok: true } }

  if (method === 'PUT' && parts[0] === 'months' && parts.length === 1) {
    requireAuth(req)
    return putMonth(await readJson(req))
  }
  if (method === 'POST' && parts[0] === 'months' && parts[2] === 'invoices') {
    requireAuth(req)
    return postInvoice(Number(parts[1]), await readJson(req))
  }
  if (method === 'DELETE' && parts[0] === 'invoices' && parts[1]) {
    requireAuth(req)
    const r = await pool.query('DELETE FROM invoices WHERE id = $1', [Number(parts[1])])
    return { deleted: r.rowCount }
  }
  if (method === 'DELETE' && parts[0] === 'months' && parts[1]) {
    requireAuth(req)
    const r = await pool.query('DELETE FROM months WHERE id = $1', [Number(parts[1])])
    return { deleted: r.rowCount }
  }
  throw new HttpError(404, 'Ruta no encontrada')
}

export default {
  async fetch(req: Request): Promise<Response> {
    const headers = cors(req)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    try {
      return Response.json(await route(req), { headers })
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      if (status === 500) console.error(e)
      return Response.json({ error: (e as Error).message }, { status, headers })
    }
  },
}
