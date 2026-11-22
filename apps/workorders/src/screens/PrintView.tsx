import { db } from '../lib/db'
import { useLive, go } from '../lib/hooks'
import { customerDoc, KIND_LABEL } from '../lib/customerDoc'
import { money } from '../lib/money'
import { dateTime, shortDate, STATUS } from '../lib/format'
import { logoUrl } from '../lib/logo'
import { Empty } from '../components/ui'
import type { Business } from '../lib/types'

export default function PrintView({ id, business }: { id: string; business: Business }) {
  const data = useLive(async () => {
    const w = await db.work_orders.get(id)
    if (!w) return null
    return {
      w,
      c: w.customer_id ? await db.customers.get(w.customer_id) : undefined,
      v: w.vehicle_id ? await db.vehicles.get(w.vehicle_id) : undefined,
      sigs: (await db.signatures.where('work_order_id').equals(id).toArray()).sort((a, b) => a.signed_at.localeCompare(b.signed_at)),
    }
  }, [id])
  if (data === undefined) return <Empty>Loading…</Empty>
  if (!data) return <Empty>Work order not found.</Empty>
  const { w, c, v, sigs } = data
  const doc = customerDoc(w, business, c, v)
  const logo = logoUrl(business.logo_path)
  const isInvoice = ['completed', 'paid'].includes(w.status)

  return (
    <div className="doc-wrap">
      <div className="doc-actions no-print">
        <button className="secondary" onClick={() => go(`/orders/${id}`)}>‹ Back</button>
        <button onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      <article className="doc">
        <header className="doc-head">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {logo && <img src={logo} alt="" className="doc-logo" />}
            <div>
              <h1>{business.name}</h1>
              {business.legal_name && <div>{business.legal_name}</div>}
              <div className="small">{[business.address, business.phone, business.email].filter(Boolean).join(' · ')}</div>
              {business.license_number && <div className="small">License {business.license_number}</div>}
            </div>
          </div>
          <div className="right">
            <h2>{isInvoice ? 'Invoice' : 'Work order / Estimate'}</h2>
            <div className="doc-num">{doc.workOrder.number}</div>
            <div className="small">{shortDate(w.created_at)}</div>
            <div className="small">{STATUS[w.status].label}</div>
          </div>
        </header>

        <div className="doc-grid">
          <div><h3>Customer</h3><div>{doc.customer.name}</div><div className="small">{[doc.customer.phone, doc.customer.email].filter(Boolean).join(' · ')}</div><div className="small">{doc.customer.address}</div></div>
          {doc.vehicle && <div><h3>Vehicle</h3><div>{doc.vehicle.description}</div>
            <div className="small">{[doc.vehicle.engine, doc.vehicle.plate && `Plate ${doc.vehicle.plate}`, doc.vehicle.mileage && `${doc.vehicle.mileage} mi`].filter(Boolean).join(' · ')}</div>
            {doc.vehicle.vin && <div className="small">VIN {doc.vehicle.vin}</div>}</div>}
        </div>

        {doc.complaint && <section><h3>Customer concern</h3><p>{doc.complaint}</p></section>}
        {doc.findings && <section><h3>Findings</h3><p>{doc.findings}</p></section>}

        <table className="doc-table">
          <thead><tr><th>Description</th>{doc.itemized && <><th className="right">Parts</th><th className="right">Labor</th></>}<th className="right">Amount</th></tr></thead>
          <tbody>
            {doc.diagnosis.amount > 0 && <tr><td>Diagnosis ({doc.diagnosis.hours} hr)</td>{doc.itemized && <><td /><td /></>}<td className="right">{money(doc.diagnosis.amount)}</td></tr>}
            {doc.jobs.map((j, i) => (
              <tr key={i}><td><b>{j.title || 'Repair'}</b>{j.notes && <div className="small">{j.notes}</div>}{j.partList?.length ? <div className="small">{j.partList.join(', ')}</div> : null}</td>
                {doc.itemized && <><td className="right">{money(j.parts ?? 0)}</td><td className="right">{money(j.labor ?? 0)}</td></>}
                <td className="right">{money(j.total)}</td></tr>
            ))}
            {doc.diagnosis.credit > 0 && <tr><td>Diagnosis credit</td>{doc.itemized && <><td /><td /></>}<td className="right">−{money(doc.diagnosis.credit)}</td></tr>}
            {doc.fees.map((f, i) => <tr key={`f${i}`}><td>{f.name}</td>{doc.itemized && <><td /><td /></>}<td className="right">{money(f.amount)}</td></tr>)}
          </tbody>
        </table>

        <div className="doc-totals">
          {doc.itemized && <><div className="spread"><span>Parts</span><span>{money(doc.totals.parts ?? 0)}</span></div><div className="spread"><span>Labor</span><span>{money(doc.totals.labor ?? 0)}</span></div></>}
          <div className="spread"><span>Subtotal</span><span>{money(doc.totals.subtotal)}</span></div>
          <div className="spread"><span>Tax ({doc.tax.rate}%)</span><span>{money(doc.tax.amount)}</span></div>
          <div className="spread grand"><span>Total</span><span>{money(doc.totals.total)}</span></div>
          {doc.totals.paid > 0 && <><div className="spread"><span>Paid</span><span>−{money(doc.totals.paid)}</span></div>
            <div className="spread"><b>Balance due</b><b>{money(doc.totals.balance)}</b></div></>}
        </div>

        <section><h3>Terms</h3><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{[w.data.terms.diagnosis, w.data.terms.repair, w.data.terms.general].filter(Boolean).join('\n\n')}</p></section>

        <section className="doc-sigs">
          {sigs.length ? sigs.map((s) => (
            <div key={s.id} className="doc-sig">
              <img src={s.image} alt="" />
              <div><b>{KIND_LABEL[s.kind]}</b> · {money(Number((s.snapshot as { amount?: number }).amount ?? 0))}</div>
              <div className="small">{s.signer_name} · {dateTime(s.signed_at)}</div>
              <div className="small">Record #{s.snapshot_hash.slice(0, 16)}</div>
            </div>
          )) : <div className="small">Not yet signed.</div>}
        </section>
      </article>
    </div>
  )
}
