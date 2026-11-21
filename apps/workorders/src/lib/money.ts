import type { Job, WorkOrderData } from './types'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

export const priceFromCost = (cost: number, markupPct: number) => r2(num(cost) * (1 + num(markupPct) / 100))

export const jobParts = (j: Job) => r2(j.parts.reduce((s, p) => s + num(p.qty) * num(p.price), 0))
export const jobLabor = (j: Job) => r2(num(j.laborHours) * num(j.laborRate))
/** What the customer sees for a job: parts and labor together. */
export const jobTotal = (j: Job) => r2(jobParts(j) + jobLabor(j))

export interface Totals {
  parts: number
  labor: number
  diag: number
  diagCredit: number
  fees: number
  subtotal: number
  taxable: number
  tax: number
  total: number
  paid: number
  balance: number
  partsCost: number
  profitOnParts: number
}

export function totals(d: WorkOrderData): Totals {
  const parts = r2(d.jobs.reduce((s, j) => s + jobParts(j), 0))
  const labor = r2(d.jobs.reduce((s, j) => s + jobLabor(j), 0))
  const diag = d.diag.waived ? 0 : r2(num(d.diag.hours) * num(d.diag.rate))
  // Crediting the diagnosis toward the repair only applies once there's labor to credit against.
  const diagCredit = d.diag.creditToRepair ? Math.min(diag, labor) : 0
  const fees = r2(d.fees.reduce((s, f) => s + num(f.amount), 0))
  const taxableFees = r2(d.fees.filter((f) => f.taxable).reduce((s, f) => s + num(f.amount), 0))
  const subtotal = r2(parts + labor + diag - diagCredit + fees)
  const taxable = r2(
    (d.tax.taxParts ? parts : 0) +
      (d.tax.taxLabor ? labor + diag - diagCredit : 0) +
      (d.tax.taxFees ? fees : taxableFees),
  )
  const tax = r2((taxable * num(d.tax.rate)) / 100)
  const total = r2(subtotal + tax)
  const paid = r2(d.payments.reduce((s, p) => s + num(p.amount), 0))
  const partsCost = r2(d.jobs.reduce((s, j) => s + j.parts.reduce((t, p) => t + num(p.qty) * num(p.cost), 0), 0))
  return {
    parts, labor, diag, diagCredit, fees, subtotal, taxable, tax, total, paid,
    balance: r2(total - paid), partsCost, profitOnParts: r2(parts - partsCost),
  }
}

export const money = (n: number) =>
  num(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
