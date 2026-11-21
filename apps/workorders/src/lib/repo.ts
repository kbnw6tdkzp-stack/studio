import { db } from './db'
import { queue } from './sync'
import { uid, newWorkOrderData, withDefaults } from './defaults'
import { totals } from './money'
import type { Business, Customer, Profile, Signature, Vehicle, WorkOrder, WorkOrderData } from './types'

const now = () => new Date().toISOString()

// Every save writes to the device first, then queues an upload.

export async function saveBusiness(b: Business) {
  const row = { ...b, updated_at: now() }
  await db.businesses.put(row)
  await queue('businesses', b.id)
  return row
}

export async function createBusiness(ownerId: string, patch: Partial<Business>) {
  const b: Business = {
    id: uid(), owner_id: ownerId, industry: 'automotive', name: '', legal_name: '', entity_type: 'sole_proprietor',
    license_number: '', phone: '', email: '', address: '', website: '', logo_path: null,
    settings: withDefaults(null), updated_at: now(), deleted_at: null, ...patch,
  }
  return saveBusiness(b)
}

export async function saveProfile(p: Profile) {
  await db.profiles.put({ ...p, updated_at: now() })
  await queue('profiles', p.user_id)
}

export async function saveCustomer(c: Customer) {
  await db.customers.put({ ...c, updated_at: now() })
  await queue('customers', c.id)
}

export const blankCustomer = (businessId: string): Customer => ({
  id: uid(), business_id: businessId, name: '', company: '', phone: '', email: '', address: '', notes: '',
  created_at: now(), updated_at: now(), deleted_at: null,
})

export async function saveVehicle(v: Vehicle) {
  await db.vehicles.put({ ...v, updated_at: now() })
  await queue('vehicles', v.id)
}

export const blankVehicle = (businessId: string, customerId: string): Vehicle => ({
  id: uid(), business_id: businessId, customer_id: customerId, vin: '', year: '', make: '', model: '', trim: '',
  engine: '', color: '', plate: '', mileage: '', details: {}, created_at: now(), updated_at: now(), deleted_at: null,
})

export async function saveWorkOrder(w: WorkOrder) {
  const t = totals(w.data)
  const row: WorkOrder = {
    ...w,
    subtotal: t.subtotal, tax: t.tax, total: t.total, amount_paid: t.paid, parts_cost: t.partsCost,
    paid_at: w.status === 'paid' ? (w.paid_at ?? now()) : null,
    updated_at: now(),
  }
  await db.work_orders.put(row)
  await queue('work_orders', w.id)
  return row
}

export async function createWorkOrder(b: Business, customerId: string | null, vehicleId: string | null) {
  const data: WorkOrderData = newWorkOrderData(withDefaults(b.settings))
  const w: WorkOrder = {
    id: uid(), business_id: b.id, number: null, customer_id: customerId, vehicle_id: vehicleId, status: 'draft',
    data, subtotal: 0, tax: 0, total: 0, amount_paid: 0, parts_cost: 0, paid_at: null,
    created_at: now(), updated_at: now(), deleted_at: null,
  }
  return saveWorkOrder(w)
}

export async function addSignature(s: Signature) {
  await db.signatures.put(s)
  await queue('signatures', s.id)
}

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** JSON with keys sorted, so the same agreement always hashes the same way
 *  (the database stores JSON with its own key order). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}
