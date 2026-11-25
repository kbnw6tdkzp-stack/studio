import { useState } from 'react'
import { db } from '../lib/db'
import { useDraft, useLive, go } from '../lib/hooks'
import { blankVehicle, createWorkOrder, saveCustomer } from '../lib/repo'
import { STATUS, customerName, shortDate, vehicleName, woNumber } from '../lib/format'
import { money } from '../lib/money'
import { Badge, Empty, Section } from '../components/ui'
import { CustomerForm } from '../components/CustomerForm'
import { VehicleSheet } from '../components/VehicleSheet'
import type { Business, Customer, Vehicle } from '../lib/types'

export default function CustomerDetail({ id, business }: { id: string; business: Business }) {
  const data = useLive(async () => ({
    c: await db.customers.get(id),
    vs: (await db.vehicles.where('customer_id').equals(id).toArray()).filter((v) => !v.deleted_at),
    ws: (await db.work_orders.where('customer_id').equals(id).toArray()).filter((w) => !w.deleted_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }), [id])
  const [c, commitC] = useDraft<Customer>(data?.c, saveCustomer, 500)
  const [editing, setEditing] = useState(false)
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)

  if (!data) return <Empty>Loading…</Empty>
  if (!data.c || !c) return <Empty>Customer not found.</Empty>

  const set = (patch: Partial<Customer>) => commitC({ ...c, ...patch })
  const lifetime = data.ws.filter((w) => w.status !== 'void').reduce((s, w) => s + Number(w.amount_paid), 0)

  return (
    <div className="stack">
      <div className="topbar"><button className="back" onClick={() => go('/customers')}>‹ Customers</button>
        <button className="ghost" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button></div>
      <h1>{customerName(c)}</h1>
      {editing ? (
        <Section><CustomerForm c={c} set={set} />
          <button className="danger" onClick={async () => {
            if (!confirm('Remove this customer? Their work orders stay in your records.')) return
            await saveCustomer({ ...c, deleted_at: new Date().toISOString() }); go('/customers')
          }}>Remove customer</button>
        </Section>
      ) : (
        <Section>
          <div className="row wrap">
            {c.phone && <a className="badge blue" href={`tel:${c.phone}`}>Call {c.phone}</a>}
            {c.phone && <a className="badge blue" href={`sms:${c.phone}`}>Text</a>}
            {c.email && <a className="badge blue" href={`mailto:${c.email}`}>Email</a>}
            {c.address && <a className="badge blue" href={`https://maps.apple.com/?q=${encodeURIComponent(c.address)}`}>Directions</a>}
          </div>
          {c.address && <div className="muted">{c.address}</div>}
          {c.notes && <div style={{ whiteSpace: 'pre-wrap' }}>{c.notes}</div>}
          <div className="small muted">Customer since {shortDate(c.created_at)} · Paid to date {money(lifetime)}</div>
        </Section>
      )}

      <Section title="Vehicles" action={<button className="small secondary" onClick={() => setVehicle(blankVehicle(business.id, c.id))}>Add vehicle</button>}>
        {data.vs.length ? (
          <div className="list">
            {data.vs.map((v) => (
              <div key={v.id} className="item">
                <button className="ghost" style={{ textAlign: 'left', padding: 0, color: 'var(--text)', fontWeight: 400 }} onClick={() => setVehicle(v)}>
                  <div className="title">{vehicleName(v)}</div>
                  <div className="sub">{[v.engine, v.plate, v.vin && `VIN ${v.vin}`].filter(Boolean).join(' · ')}</div>
                </button>
                <button className="small" onClick={async () => { const w = await createWorkOrder(business, c.id, v.id); go(`/orders/${w.id}`) }}>New WO</button>
              </div>
            ))}
          </div>
        ) : <Empty>No vehicles yet.</Empty>}
      </Section>

      <Section title="Work order history">
        {data.ws.length ? (
          <div className="list">
            {data.ws.map((w) => {
              const v = data.vs.find((x) => x.id === w.vehicle_id)
              return (
                <button key={w.id} className="item" onClick={() => go(`/orders/${w.id}`)}>
                  <div><div className="title">{woNumber(w, business)} · {w.data.complaint || 'No description'}</div>
                    <div className="sub">{shortDate(w.created_at)}{v ? ` · ${vehicleName(v)}` : ''}</div></div>
                  <div className="right"><div className="num">{money(Number(w.total))}</div><Badge tone={STATUS[w.status].tone}>{STATUS[w.status].label}</Badge></div>
                </button>
              )
            })}
          </div>
        ) : <Empty>No work orders yet.</Empty>}
      </Section>
      {vehicle && <VehicleSheet vehicle={vehicle} onClose={() => setVehicle(null)} />}
    </div>
  )
}
