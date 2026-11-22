import { useState } from 'react'
import { db } from '../lib/db'
import { useLive, go } from '../lib/hooks'
import { blankCustomer, blankVehicle, createWorkOrder, saveCustomer } from '../lib/repo'
import { STATUS, customerName, shortDate, vehicleName, woNumber } from '../lib/format'
import { money } from '../lib/money'
import { Badge, Empty, Sheet } from '../components/ui'
import { CustomerForm } from '../components/CustomerForm'
import { VehicleSheet } from '../components/VehicleSheet'
import { SyncBadge } from '../components/SyncBadge'
import type { Business, Customer, Status, Vehicle } from '../lib/types'

const FILTERS: { key: string; label: string; match: (s: Status) => boolean }[] = [
  { key: 'open', label: 'Open', match: (s) => !['paid', 'void'].includes(s) },
  { key: 'unpaid', label: 'Unpaid', match: (s) => s === 'completed' },
  { key: 'paid', label: 'Paid', match: (s) => s === 'paid' },
  { key: 'all', label: 'All', match: () => true },
]

export default function Orders({ business }: { business: Business }) {
  const [filter, setFilter] = useState('open')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const data = useLive(async () => {
    const [ws, cs, vs] = await Promise.all([
      db.work_orders.where('business_id').equals(business.id).filter((w) => !w.deleted_at).toArray(),
      db.customers.where('business_id').equals(business.id).toArray(),
      db.vehicles.where('business_id').equals(business.id).toArray(),
    ])
    return {
      ws: ws.sort((a, b) => (b.number ?? 1e9) - (a.number ?? 1e9) || b.created_at.localeCompare(a.created_at)),
      cs: new Map(cs.map((c) => [c.id, c])), vs: new Map(vs.map((v) => [v.id, v])),
    }
  }, [business.id])

  const f = FILTERS.find((x) => x.key === filter)!
  const needle = q.trim().toLowerCase()
  const list = (data?.ws ?? []).filter((w) => f.match(w.status)).filter((w) => {
    if (!needle) return true
    const c = data!.cs.get(w.customer_id ?? ''), v = data!.vs.get(w.vehicle_id ?? '')
    return [woNumber(w, business), String(w.number ?? ''), customerName(c), c?.phone, vehicleName(v), v?.vin, v?.plate, w.data.complaint]
      .join(' ').toLowerCase().includes(needle)
  })

  return (
    <div className="stack">
      <div className="topbar"><h1>Work orders</h1><SyncBadge /></div>
      <button className="block" onClick={() => setCreating(true)}>+ New work order</button>
      <div className="seg">{FILTERS.map((x) => <button key={x.key} className={filter === x.key ? 'on' : ''} onClick={() => setFilter(x.key)}>{x.label}</button>)}</div>
      <input placeholder="Search number, customer, vehicle, VIN" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length ? (
        <div className="list">
          {list.map((w) => {
            const c = data!.cs.get(w.customer_id ?? ''), v = data!.vs.get(w.vehicle_id ?? '')
            return (
              <button key={w.id} className="item" onClick={() => go(`/orders/${w.id}`)}>
                <div style={{ minWidth: 0 }}>
                  <div className="title">{woNumber(w, business)} · {customerName(c)}</div>
                  <div className="sub">{[vehicleName(v), w.data.complaint, shortDate(w.created_at)].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="right"><div className="num">{money(Number(w.total))}</div><Badge tone={STATUS[w.status].tone}>{STATUS[w.status].label}</Badge></div>
              </button>
            )
          })}
        </div>
      ) : <Empty>{data ? (needle ? 'No matches.' : 'Nothing here yet.') : 'Loading…'}</Empty>}
      {creating && <NewOrder business={business} onClose={() => setCreating(false)} />}
    </div>
  )
}

/** Pick or add the customer, then the vehicle, then open the new work order. */
function NewOrder({ business, onClose }: { business: Business; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [newC, setNewC] = useState<Customer | null>(null)
  const [newV, setNewV] = useState<Vehicle | null>(null)
  const cs = useLive(() => db.customers.where('business_id').equals(business.id).filter((c) => !c.deleted_at).toArray(), [business.id])
  const vs = useLive(() => customer ? db.vehicles.where('customer_id').equals(customer.id).filter((v) => !v.deleted_at).toArray() : Promise.resolve([] as Vehicle[]), [customer?.id])

  const start = async (c: Customer, v: Vehicle | null) => {
    const w = await createWorkOrder(business, c.id, v?.id ?? null)
    onClose(); go(`/orders/${w.id}`)
  }

  if (newV) return <VehicleSheet vehicle={newV} onClose={() => setNewV(null)} onSaved={(v) => void start(customer!, v)} />

  if (customer) {
    return (
      <Sheet title={`Vehicle for ${customerName(customer)}`} onClose={onClose}>
        <div className="list">
          {(vs ?? []).map((v) => (
            <button key={v.id} className="item" onClick={() => void start(customer, v)}>
              <div><div className="title">{vehicleName(v)}</div><div className="sub">{[v.plate, v.vin].filter(Boolean).join(' · ')}</div></div><span>›</span>
            </button>
          ))}
        </div>
        <button className="block" onClick={() => setNewV(blankVehicle(business.id, customer.id))}>+ Add a vehicle (scan or type VIN)</button>
        <button className="secondary" onClick={() => void start(customer, null)}>Skip for now</button>
      </Sheet>
    )
  }

  if (newC) {
    return (
      <Sheet title="New customer" onClose={onClose}>
        <CustomerForm c={newC} set={(p) => setNewC({ ...newC, ...p })} />
        <button className="block" disabled={!newC.name.trim()} onClick={async () => { await saveCustomer(newC); setCustomer(newC) }}>Next: vehicle</button>
      </Sheet>
    )
  }

  const needle = q.trim().toLowerCase()
  const list = (cs ?? []).filter((c) => !needle || [c.name, c.phone, c.company].join(' ').toLowerCase().includes(needle))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 30)
  return (
    <Sheet title="Who's it for?" onClose={onClose}>
      <button className="block" onClick={() => setNewC({ ...blankCustomer(business.id), name: q })}>+ New customer{q ? ` “${q}”` : ''}</button>
      <input placeholder="Search existing customers" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="list">
        {list.map((c) => (
          <button key={c.id} className="item" onClick={() => setCustomer(c)}>
            <div><div className="title">{customerName(c)}</div><div className="sub">{c.phone}</div></div><span>›</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
