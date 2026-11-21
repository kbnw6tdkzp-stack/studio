import type { Settings, WorkOrderData } from './types'

export const uid = () => crypto.randomUUID()

// Base state rates only. Local district taxes add to these, so edit each preset
// to the full rate for the area you work in.
export const defaultSettings = (): Settings => ({
  laborRate: 160,
  diagRate: 160,
  diagHours: 1,
  partsMarkupPct: 30,
  taxPresets: [
    { id: uid(), name: 'California (edit to local rate)', rate: 7.25, taxParts: true, taxLabor: false, taxFees: false },
    { id: uid(), name: 'Nevada (edit to local rate)', rate: 6.85, taxParts: true, taxLabor: false, taxFees: false },
  ],
  defaultTaxPresetId: null,
  feePresets: [
    { id: uid(), name: 'Oil / fluid disposal', amount: 10, taxable: false },
    { id: uid(), name: 'Tire disposal (each)', amount: 5, taxable: false },
    { id: uid(), name: 'Battery / core disposal', amount: 10, taxable: false },
    { id: uid(), name: 'Old parts disposal', amount: 10, taxable: false },
  ],
  terms: {
    diagnosis:
      'I authorize a diagnostic inspection of the vehicle described above at the rate shown. ' +
      'I understand the diagnostic fee is owed whether or not I approve any repairs.',
    repair:
      'I authorize the repairs and estimated charges listed above. Charges will not exceed this estimate ' +
      'without my further approval. I agree to pay the full amount when the work is completed.',
    general:
      'Please remove all valuables and personal items from the vehicle. The business is not responsible for ' +
      'loss of or damage to articles left in the vehicle, or for delays caused by parts availability. ' +
      'Unless I request otherwise, replaced parts will be disposed of and applicable disposal fees will apply. ' +
      'Unpaid balances may be pursued through small claims court, and I agree to pay reasonable collection costs. ' +
      'An express mechanic\'s lien is acknowledged on the vehicle to secure the amount of repairs.',
  },
  numberPrefix: 'WO-',
  numberPad: 4,
  customerView: 'combined',
})

export const withDefaults = (s: Partial<Settings> | null | undefined): Settings => {
  const d = defaultSettings()
  return { ...d, ...(s ?? {}), terms: { ...d.terms, ...(s?.terms ?? {}) } }
}

export const newWorkOrderData = (s: Settings): WorkOrderData => {
  const preset = s.taxPresets.find((p) => p.id === s.defaultTaxPresetId) ?? s.taxPresets[0]
  return {
    complaint: '',
    findings: '',
    notes: '',
    mileageIn: '',
    diag: { hours: s.diagHours, rate: s.diagRate, waived: false, creditToRepair: false },
    jobs: [],
    fees: [],
    tax: preset
      ? { name: preset.name, rate: preset.rate, taxParts: preset.taxParts, taxLabor: preset.taxLabor, taxFees: preset.taxFees }
      : { name: 'No tax', rate: 0, taxParts: false, taxLabor: false, taxFees: false },
    terms: { ...s.terms },
    payments: [],
  }
}
