import type { Business, Customer, Status, Vehicle, WorkOrder } from './types'
import { withDefaults } from './defaults'

export function woNumber(w: Pick<WorkOrder, 'number'>, b: Business | undefined) {
  const s = withDefaults(b?.settings)
  if (w.number == null) return 'Pending #'
  return `${s.numberPrefix}${String(w.number).padStart(s.numberPad, '0')}`
}

export const vehicleName = (v?: Vehicle | null) =>
  v ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Vehicle' : ''

export const customerName = (c?: Customer | null) => c?.name || c?.company || 'Unnamed customer'

export const STATUS: Record<Status, { label: string; tone: string }> = {
  draft: { label: 'New', tone: 'gray' },
  diag_authorized: { label: 'Diagnosis approved', tone: 'blue' },
  estimate: { label: 'Estimate sent', tone: 'amber' },
  approved: { label: 'Repair approved', tone: 'blue' },
  in_progress: { label: 'In progress', tone: 'blue' },
  completed: { label: 'Completed', tone: 'amber' },
  paid: { label: 'Paid', tone: 'green' },
  void: { label: 'Void', tone: 'red' },
}

export const ENTITY: Record<Business['entity_type'], string> = {
  sole_proprietor: 'Sole proprietor', llc: 'LLC', corporation: 'Corporation', partnership: 'Partnership',
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
export const dateTime = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
