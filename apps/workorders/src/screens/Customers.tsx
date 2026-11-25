import { useState } from 'react'
import { db } from '../lib/db'
import { useLive, go } from '../lib/hooks'
import { blankCustomer, saveCustomer } from '../lib/repo'
import { customerName, vehicleName } from '../lib/format'
import { Empty, Sheet } from '../components/ui'
import { CustomerForm } from '../components/CustomerForm'
import { SyncBadge } from '../components/SyncBadge'
import type { Business, Customer } from '../lib/types'

export default function Customers({ business }: { business: Business }) {
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState<Customer | null>(null)
  const data = useLive(async () => {
    const [cs, vs] = await Promise.all([
      db.customers.where('business_id').equals(business.id).filter((c) => !c.deleted_at).toArray(),
      db.vehicles.where('business_id').equals(business.id).filter((v) => !v.deleted_at).toArray(),
    ])
    return { cs: cs.sort((a, b) => customerName(a).localeCompare(customerName(b))), vs }
  }, [business.id])

  const needle = q.trim().toLowerCase()
  const list = (data?.cs ?? []).filter((c) => {
    if (!needle) return true
    const vs = data!.vs.filter((v) => v.customer_id === c.id)
    return [c.name, c.company, c.phone, c.email, c.address, ...vs.flatMap((v) => [vehicleName(v), v.vin, v.plate])]
      .join(' ').toLowerCase().includes(needle)
  })

  return (
    <div className="stack">
      <div className="topbar"><h1>Customers</h1><SyncBadge /></div>
      <div className="row">
        <input placeholder="Search name, phone, vehicle, VIN, plate" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => setAdding(blankCustomer(business.id))}>Add</button>
      </div>
      {list.length ? (
        <div className="list">
          {list.map((c) => {
            const vs = data!.vs.filter((v) => v.customer_id === c.id)
            return (
              <button key={c.id} className="item" onClick={() => go(`/customers/${c.id}`)}>
                <div><div className="title">{customerName(c)}</div>
                  <div className="sub">{[c.phone, vs.map(vehicleName).join(', ')].filter(Boolean).join(' · ') || 'No vehicles yet'}</div></div>
                <span className="muted">›</span>
              </button>
            )
          })}
        </div>
      ) : <Empty>{data ? (needle ? 'No matches.' : 'No customers yet. Add one, or start a work order.') : 'Loading…'}</Empty>}
      {adding && (
        <Sheet title="New customer" onClose={() => setAdding(null)}>
          <CustomerForm c={adding} set={(p) => setAdding({ ...adding, ...p })} />
          <button className="block" disabled={!adding.name.trim() && !adding.company.trim()}
            onClick={async () => { await saveCustomer(adding); go(`/customers/${adding.id}`); setAdding(null) }}>Save customer</button>
        </Sheet>
      )}
    </div>
  )
}
