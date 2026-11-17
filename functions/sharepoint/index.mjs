// Neon Function «sharepoint»: lee una carpeta compartida de SharePoint/OneDrive
// («cualquier persona con el enlace») para que el dashboard pueda importar facturas.
//   POST { action: 'list', url, password }        → { folder, files: [{ path, name, size, modified }] }
//   POST { action: 'file', url, password, path }  → bytes del archivo
// Solo se permiten enlaces de natuaromatic-my.sharepoint.com y exige la contraseña de carga.

const HOST = 'natuaromatic-my.sharepoint.com'
const ORIGINS = ['https://digitalmanagernatu-cell.github.io', 'http://localhost:5173', 'http://localhost:4173']
const MAX_FILES = 300

const cors = req => {
  const o = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
const fail = (status, msg, h) => Response.json({ error: msg }, { status, headers: h })

/** Abre el enlace compartido (sigue redirecciones guardando cookies) → cookie de invitado + ruta de la carpeta. */
async function openShare(shareUrl) {
  let u = new URL(shareUrl)
  if (u.hostname !== HOST) throw new Error(`Solo se admiten enlaces de ${HOST}`)
  const jar = new Map()
  for (let i = 0; i < 10; i++) {
    const res = await fetch(u, { redirect: 'manual', headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } })
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';'); const j = kv.indexOf('=')
      if (j > 0) jar.set(kv.slice(0, j).trim(), kv.slice(j + 1))
    }
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) { u = new URL(loc, u); continue }
    break
  }
  if (!jar.has('FedAuth')) throw new Error('El enlace no da acceso. Compártelo como «Cualquier persona con el vínculo puede ver».')
  const id = u.searchParams.get('id')
  if (!id) throw new Error('El enlace no apunta a una carpeta')
  const site = id.split('/').slice(0, 3).join('/') // /personal/<usuario>
  return { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), folder: id, base: `https://${HOST}${site}` }
}

const q = p => encodeURIComponent(p.replace(/'/g, "''"))

async function api(s, path, accept = 'application/json;odata=nometadata') {
  const res = await fetch(`${s.base}/_api/web/${path}`, { headers: { cookie: s.cookie, accept } })
  if (!res.ok) throw new Error(`SharePoint ${res.status}`)
  return res
}

async function list(s) {
  const out = []
  async function walk(folder, rel, depth) {
    if (depth > 4 || out.length > MAX_FILES) return
    const d = await (await api(s, `GetFolderByServerRelativeUrl('${q(folder)}')?$expand=Files,Folders&$select=Files/Name,Files/Length,Files/TimeLastModified,Folders/Name`)).json()
    for (const f of d.Files ?? []) out.push({ path: rel ? `${rel}/${f.Name}` : f.Name, name: f.Name, size: +f.Length, modified: f.TimeLastModified })
    for (const sub of d.Folders ?? []) if (sub.Name !== 'Forms') await walk(`${folder}/${sub.Name}`, rel ? `${rel}/${sub.Name}` : sub.Name, depth + 1)
  }
  await walk(s.folder, '', 0)
  return out
}

export default {
  async fetch(req) {
    const h = cors(req)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
    if (req.method !== 'POST') return fail(405, 'Usa POST', h)
    let body
    try { body = await req.json() } catch { return fail(400, 'JSON inválido', h) }
    if (!process.env.UPLOAD_PASSWORD || body.password !== process.env.UPLOAD_PASSWORD) return fail(401, 'Contraseña incorrecta', h)
    try {
      const s = await openShare(String(body.url ?? ''))
      if (body.action === 'list') {
        return Response.json({ folder: s.folder.split('/').slice(-3).join(' / '), files: await list(s) }, { headers: h })
      }
      if (body.action === 'file') {
        const p = String(body.path ?? '')
        if (!p || p.includes('..')) return fail(400, 'Ruta no válida', h)
        const res = await api(s, `GetFileByServerRelativeUrl('${q(`${s.folder}/${p}`)}')/$value`, '*/*')
        return new Response(res.body, { headers: { ...h, 'Content-Type': 'application/octet-stream' } })
      }
      return fail(400, 'Acción desconocida', h)
    } catch (e) {
      return fail(502, e.message || String(e), h)
    }
  },
}
