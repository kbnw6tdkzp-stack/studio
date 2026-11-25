import { jobLabor, jobParts, jobTotal, totals } from './money'
import { withDefaults } from './defaults'
import { customerName, vehicleName, woNumber, ENTITY } from './format'
import type { Business, Customer, SignatureKind, Vehicle, WorkOrder } from './types'

/** What the customer is shown and agrees to. Never includes your cost or markup. */
export function customerDoc(w: WorkOrder, b: Business, c?: Customer | null, v?: Vehicle | null) {
  const s = withDefaults(b.settings)
  const t = totals(w.data)
  const itemized = s.customerView === 'itemized'
  return {
    business: {
      name: b.name, legal_name: b.legal_name, entity: b.entity_type === 'sole_proprietor' ? '' : ENTITY[b.entity_type],
      license: b.license_number, phone: b.phone, email: b.email, address: b.address,
    },
    workOrder: { id: w.id, number: woNumber(w, b), created_at: w.created_at },
    customer: { name: customerName(c), phone: c?.phone ?? '', email: c?.email ?? '', address: c?.address ?? '' },
    vehicle: v ? { description: vehicleName(v), vin: v.vin, plate: v.plate, mileage: w.data.mileageIn || v.mileage, engine: v.engine } : null,
    complaint: w.data.complaint,
    findings: w.data.findings,
    diagnosis: { hours: w.data.diag.hours, rate: w.data.diag.rate, amount: t.diag, waived: w.data.diag.waived, credit: t.diagCredit },
    jobs: w.data.jobs.map((j) => ({
      title: j.title, notes: j.notes, total: jobTotal(j),
      ...(itemized ? { parts: jobParts(j), labor: jobLabor(j), partList: j.parts.map((p) => `${p.qty} × ${p.desc}`) } : {}),
    })),
    fees: w.data.fees.map((f) => ({ name: f.name, amount: f.amount })),
    tax: { name: w.data.tax.name, rate: w.data.tax.rate, amount: t.tax },
    totals: { ...(itemized ? { parts: t.parts, labor: t.labor } : {}), subtotal: t.subtotal, tax: t.tax, total: t.total, paid: t.paid, balance: t.balance },
    itemized,
  }
}

export type CustomerDoc = ReturnType<typeof customerDoc>

export const termsFor = (kind: SignatureKind, w: WorkOrder) =>
  kind === 'diagnosis' ? [w.data.terms.diagnosis, w.data.terms.general]
  : kind === 'repair' ? [w.data.terms.repair, w.data.terms.general]
  : ['I confirm the work described above was completed and I received the vehicle.']

export const KIND_LABEL: Record<SignatureKind, string> = {
  diagnosis: 'Diagnosis authorization',
  repair: 'Repair authorization',
  completion: 'Work completed / vehicle received',
}
