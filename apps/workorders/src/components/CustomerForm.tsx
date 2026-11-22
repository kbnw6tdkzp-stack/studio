import { Field } from './ui'
import type { Customer } from '../lib/types'

export function CustomerForm({ c, set }: { c: Customer; set: (patch: Partial<Customer>) => void }) {
  return (
    <>
      <Field label="Name" value={c.name} onChange={(name) => set({ name })} autoComplete="off" />
      <div className="grid2">
        <Field label="Phone" value={c.phone} onChange={(phone) => set({ phone })} type="tel" inputMode="tel" />
        <Field label="Email" value={c.email} onChange={(email) => set({ email })} type="email" inputMode="email" />
      </div>
      <Field label="Address (where the vehicle is)" value={c.address} onChange={(address) => set({ address })} />
      <Field label="Company (optional)" value={c.company} onChange={(company) => set({ company })} />
      <Field label="Notes" value={c.notes} onChange={(notes) => set({ notes })} multiline />
    </>
  )
}
