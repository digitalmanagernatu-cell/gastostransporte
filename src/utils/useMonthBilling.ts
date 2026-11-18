import { useEffect, useState } from 'react'
import { api, type ApiBillingRow, type ApiMonth } from './api'

/**
 * Facturación SAP COMPLETA de un mes (todos los clientes, ~28.000 filas).
 * El dashboard solo recibe los clientes con actividad; para cruzar facturas
 * nuevas hace falta la lista completa, que se pide aquí bajo demanda.
 */
export function useMonthBilling(month: ApiMonth | null): { billing: ApiBillingRow[]; loading: boolean } {
  const [state, setState] = useState<{ key: string; billing: ApiBillingRow[] } | null>(null)
  const key = month ? `${month.id}|${month.updated_at}` : ''
  useEffect(() => {
    if (!month || state?.key === key) return
    let cancel = false
    api.getMonthBilling(month.id).then(b => { if (!cancel) setState({ key, billing: b }) }).catch(() => { /* se usa la parcial */ })
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!month) return { billing: [], loading: false }
  if (state?.key === key) return { billing: state.billing, loading: false }
  return { billing: month.billing, loading: true }
}
