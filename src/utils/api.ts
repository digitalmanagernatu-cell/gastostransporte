// Cliente de la API de datos (Neon Data API, proyecto "gastos-transporte").
// Lecturas públicas con un token anónimo de Neon Auth; las escrituras van por
// funciones SQL que exigen la contraseña de carga.
import { DATA_API_URL, AUTH_URL } from '../config'

export interface ApiBillingRow {
  invoice_number: string
  client_code: string
  client_name: string
  comercial: string
  linea_negocio: string
  base_imponible: number
  num_facturas: number
}

export interface ApiInvoice {
  id: number
  agency: string
  filename: string
  invoice_number: string | null
  total: number
  uploaded_at: string
  line_count: number
}

export interface ApiLine {
  agency: string
  client_code: string | null
  reference: string
  reference_original: string
  amount: number
}

export interface ApiMonth {
  id: number
  year: number
  month: number
  billing_filename: string | null
  updated_at: string
  billing: ApiBillingRow[]
  invoices: ApiInvoice[]
  lines: ApiLine[]
}

export interface BillingRowInput {
  invoice_number: string
  client_code: string
  client_name: string
  comercial: string
  linea_negocio: string
  base_imponible: number
  num_facturas: number
}

export interface InvoiceLineInput {
  client_code: string
  reference: string
  reference_original: string
  agency_invoice: string
  amount: number
}

let cachedToken: { value: string; exp: number } | null = null

async function getToken(force = false): Promise<string> {
  const now = Date.now() / 1000
  if (!force && cachedToken && cachedToken.exp - 60 > now) return cachedToken.value
  const res = await fetch(`${AUTH_URL}/token/anonymous`)
  if (!res.ok) throw new Error(`No se pudo conectar con la base de datos (auth ${res.status})`)
  const { token } = (await res.json()) as { token: string }
  let exp = now + 600
  try { exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp ?? exp } catch { /* ignore */ }
  cachedToken = { value: token, exp }
  return token
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}, retry = true): Promise<T> {
  const token = await getToken(!retry)
  const res = await fetch(`${DATA_API_URL}/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
  })
  if (res.status === 401 && retry) return rpc<T>(fn, args, false)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.message ?? `Error ${res.status} en ${fn}`)
  return body as T
}

export const api = {
  getDashboard: () => rpc<ApiMonth[]>('get_dashboard'),
  checkPassword: (password: string) => rpc<boolean>('check_password', { p_password: password }),
  upsertMonth: (password: string, year: number, month: number, filename: string, rows: BillingRowInput[]) =>
    rpc<{ id: number; rows: number }>('upsert_month', {
      p_password: password, p_year: year, p_month: month, p_filename: filename, p_rows: rows,
    }),
  addInvoice: (password: string, monthId: number, agency: string, filename: string, invoiceNumber: string, lines: InvoiceLineInput[]) =>
    rpc<{ id: number; lines: number; total: number }>('add_invoice', {
      p_password: password, p_month_id: monthId, p_agency: agency, p_filename: filename,
      p_invoice_number: invoiceNumber, p_lines: lines,
    }),
  deleteInvoice: (password: string, id: number) => rpc<{ deleted: number }>('delete_invoice', { p_password: password, p_id: id }),
  deleteMonth: (password: string, id: number) => rpc<{ deleted: number }>('delete_month', { p_password: password, p_id: id }),
}
