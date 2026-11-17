// Extracción de texto de PDFs por líneas (pdf.js). Las líneas se reconstruyen
// agrupando los fragmentos por altura y ordenándolos de izquierda a derecha.

export interface PdfLine {
  text: string    // celdas unidas con dos espacios
  cells: string[] // fragmentos de texto de la línea, en orden
}

export interface PdfDoc {
  lines: PdfLine[]
  text: string
  scanned: boolean // sin texto extraíble (PDF escaneado)
}

// Tipos mínimos de pdf.js para no acoplar a una versión concreta
interface PdfjsLike {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean }): { promise: Promise<{
    numPages: number
    getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
    destroy(): Promise<void>
  }> }
}

export async function extractPdf(data: ArrayBuffer, pdfjs: PdfjsLike, maxPages = 80): Promise<PdfDoc> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise
  const lines: PdfLine[] = []
  try {
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p)
      const { items } = await page.getTextContent()
      const rows: { y: number; parts: { x: number; s: string }[] }[] = []
      for (const it of items as { str?: string; transform?: number[] }[]) {
        const s = (it.str ?? '').trim()
        if (!s || !it.transform) continue
        const x = it.transform[4], y = it.transform[5]
        let row = rows.find(r => Math.abs(r.y - y) < 2.5)
        if (!row) { row = { y, parts: [] }; rows.push(row) }
        row.parts.push({ x, s })
      }
      rows.sort((a, b) => b.y - a.y)
      for (const r of rows) {
        const cells = r.parts.sort((a, b) => a.x - b.x).map(p => p.s)
        lines.push({ cells, text: cells.join('  ') })
      }
    }
  } finally {
    await doc.destroy()
  }
  const text = lines.map(l => l.text).join('\n')
  return { lines, text, scanned: text.replace(/\s/g, '').length < 40 }
}

let browserPdfjs: Promise<PdfjsLike> | null = null

/** pdf.js para el navegador (se carga solo cuando hace falta). */
export function loadBrowserPdfjs(): Promise<PdfjsLike> {
  browserPdfjs ??= (async () => {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs as unknown as PdfjsLike
  })()
  return browserPdfjs
}
