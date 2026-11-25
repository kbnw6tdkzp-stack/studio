import { money } from '../lib/money'
import { dateTime, shortDate } from '../lib/format'
import type { CustomerDoc } from '../lib/customerDoc'

export interface DocSig { label: string; amount: number | null; signer_name: string; signed_at: string; image: string; hash: string; remote?: boolean }

/** The customer-facing document: same look for the printed copy and the signing link. */
export function DocView({ doc, logo, title, status, terms, sigs, footer }: {
  doc: CustomerDoc; logo: string | null; title: string; status?: string; terms: string[]; sigs: DocSig[]; footer?: React.ReactNode
}) {
  const b = doc.business
  return (
    <article className="doc">
      <header className="doc-head">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {logo && <img src={logo} alt="" className="doc-logo" />}
          <div>
            <h1>{b.name}</h1>
            {b.legal_name && <div>{b.legal_name}</div>}
            <div className="small">{[b.address, b.phone, b.email].filter(Boolean).join(' · ')}</div>
            {b.license && <div className="small">License {b.license}</div>}
          </div>
        </div>
        <div className="right">
          <h2>{title}</h2>
          <div className="doc-num">{doc.workOrder.number}</div>
          <div className="small">{shortDate(doc.workOrder.created_at)}</div>
          {status && <div className="small">{status}</div>}
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

      {terms.length > 0 && <section><h3>Terms</h3><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{terms.filter(Boolean).join('\n\n')}</p></section>}

      {sigs.length > 0 && (
        <section className="doc-sigs">
          {sigs.map((s, i) => (
            <div key={i} className="doc-sig">
              <img src={s.image} alt="" />
              <div><b>{s.label}</b>{s.amount != null && <> · {money(s.amount)}</>}</div>
              <div className="small">{s.signer_name} · {dateTime(s.signed_at)}{s.remote ? ' · signed online' : ''}</div>
              <div className="small">Record #{s.hash.slice(0, 16)}</div>
            </div>
          ))}
        </section>
      )}
      {footer}
    </article>
  )
}
