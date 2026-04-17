export const SPREADSHEET_ID = '1zQU3WQ_IT_0RN2Tb5XoTqVRqmkSdzUpeZPWRq3aD_f8'

// Para añadir un nuevo mes: copia la última línea y actualiza label, sheetName y gid.
// El gid lo encuentras en la URL del sheet cuando estás en esa pestaña: ?gid=XXXXXXXX
export const MONTHS_CONFIG = [
  { label: 'Marzo 2026', sheetName: 'MARZO 2026', gid: '1431300331' },
] as const

export const AGENCIES = [
  'SEUR',
  'PALEMANIA',
  'TRANSAHER',
  'REDUR',
  'NACEX',
  'DHL',
  'DHL_EXPORT',
  'CORREOS',
] as const

export const ALERT_THRESHOLD = 0.10 // 10%

export const AGENCY_COLORS: Record<string, string> = {
  SEUR:       '#3b82f6',
  PALEMANIA:  '#10b981',
  TRANSAHER:  '#f59e0b',
  REDUR:      '#8b5cf6',
  NACEX:      '#ef4444',
  DHL:        '#ec4899',
  DHL_EXPORT: '#06b6d4',
  CORREOS:    '#f97316',
}

export const LINEA_NEGOCIO_COLORS = [
  '#0d9488',
  '#0284c7',
  '#7c3aed',
  '#db2777',
  '#d97706',
  '#16a34a',
  '#dc2626',
  '#9333ea',
]
