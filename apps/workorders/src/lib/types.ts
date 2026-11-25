export type ID = string

export interface TaxPreset {
  id: ID
  name: string          // e.g. "Sacramento, CA"
  rate: number          // percent, e.g. 8.75
  taxParts: boolean
  taxLabor: boolean
  taxFees: boolean
}

export interface FeePreset {
  id: ID
  name: string          // e.g. "Oil disposal"
  amount: number
  taxable: boolean
}

export interface Settings {
  laborRate: number
  diagRate: number
  diagHours: number
  partsMarkupPct: number
  taxPresets: TaxPreset[]
  defaultTaxPresetId: ID | null
  feePresets: FeePreset[]
  terms: { diagnosis: string; repair: string; general: string }
  numberPrefix: string
  numberPad: number
  customerView: 'combined' | 'itemized'
  cardFeeEnabled: boolean
  cardFeePct: number
}

export interface Business {
  id: ID
  owner_id: ID
  industry: string
  name: string
  legal_name: string
  entity_type: 'sole_proprietor' | 'llc' | 'corporation' | 'partnership'
  license_number: string
  phone: string
  email: string
  address: string
  website: string
  logo_path: string | null
  settings: Settings
  updated_at: string
  deleted_at: string | null
}

export interface Profile {
  user_id: ID
  full_name: string
  phone: string
  email: string
  address: string
  title: string
  updated_at: string
}

export interface Customer {
  id: ID
  business_id: ID
  name: string
  company: string
  phone: string
  email: string
  address: string
  notes: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Vehicle {
  id: ID
  business_id: ID
  customer_id: ID
  vin: string
  year: string
  make: string
  model: string
  trim: string
  engine: string
  color: string
  plate: string
  mileage: string
  details: Record<string, string>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Part { id: ID; desc: string; partNo: string; qty: number; cost: number; price: number }
export interface Job { id: ID; title: string; notes: string; parts: Part[]; laborHours: number; laborRate: number }
export interface Fee { id: ID; name: string; amount: number; taxable: boolean; card?: boolean }
export interface Payment { id: ID; amount: number; method: string; date: string; note: string }

export interface WorkOrderData {
  complaint: string
  findings: string
  notes: string
  mileageIn: string
  diag: { hours: number; rate: number; waived: boolean; creditToRepair: boolean }
  jobs: Job[]
  fees: Fee[]
  tax: Omit<TaxPreset, 'id'>
  terms: Settings['terms']
  payments: Payment[]
}

export type Status =
  | 'draft' | 'diag_authorized' | 'estimate' | 'approved'
  | 'in_progress' | 'completed' | 'paid' | 'void'

export interface WorkOrder {
  id: ID
  business_id: ID
  number: number | null
  customer_id: ID | null
  vehicle_id: ID | null
  status: Status
  data: WorkOrderData
  subtotal: number
  tax: number
  total: number
  amount_paid: number
  parts_cost: number
  paid_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SignatureKind = 'diagnosis' | 'repair' | 'completion'

export interface Signature {
  id: ID
  business_id: ID
  work_order_id: ID
  kind: SignatureKind
  signer_name: string
  image: string
  snapshot: unknown
  snapshot_hash: string
  method: 'in_person' | 'remote'
  user_agent: string
  signed_at: string
  created_at: string
  signer_ip?: string
  sign_request_id?: string | null
}

export interface SignRequest {
  id: ID
  business_id: ID
  work_order_id: ID
  kind: SignatureKind
  token_hash: string
  document: RemoteDocument
  status: 'pending' | 'signed' | 'cancelled'
  signature_id: ID | null
  expires_at: string
  viewed_at: string | null
  created_at: string
  updated_at: string
}

/** Exactly what the customer sees on their phone. Never includes your cost. */
export interface RemoteDocument {
  label: string
  terms: string[]
  amount: number
  logo: string | null
  doc: import('./customerDoc').CustomerDoc
}

export interface PayRequest {
  id: ID
  business_id: ID
  work_order_id: ID
  token_hash: string
  document: RemoteDocument
  amount: number
  card_fee: number
  card_fee_pct: number
  return_url: string
  status: 'pending' | 'paid' | 'cancelled'
  stripe_session_id: string | null
  paid_at: string | null
  viewed_at: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

export interface CardPayment {
  id: ID
  business_id: ID
  work_order_id: ID
  pay_request_id: ID | null
  stripe_session_id: string
  amount: number
  fee: number
  fee_pct: number
  created_at: string
}
