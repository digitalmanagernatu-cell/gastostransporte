export const SPREADSHEET_ID = '1zQU3WQ_IT_0RN2Tb5XoTqVRqmkSdzUpeZPWRq3aD_f8'

// Spanish month names used for auto-discovery of sheet tabs
export const MESES_ES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
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

export const TRANSPORT_RANGES = [
  { key: 'sano'    as const, label: 'Sanos',     description: '< 4%',     min: 0,    max: 0.04 },
  { key: 'vigilar' as const, label: 'A vigilar', description: '4% – 7%',  min: 0.04, max: 0.07 },
  { key: 'revisar' as const, label: 'A revisar', description: '7% – 10%', min: 0.07, max: 0.10 },
  { key: 'alerta'  as const, label: 'En alerta', description: '> 10%',    min: 0.10, max: Infinity },
]
export type TransportRangeKey = 'sano' | 'vigilar' | 'revisar' | 'alerta'

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
