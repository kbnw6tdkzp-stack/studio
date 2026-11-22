import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { useDraft, useLive, go } from '../lib/hooks'
import { saveWorkOrder } from '../lib/repo'
import { uid, withDefaults } from '../lib/defaults'
import { jobTotal, money, priceFromCost, totals } from '../lib/money'
import { STATUS, customerName, dateTime, vehicleName, woNumber } from '../lib/format'
import { customerDoc, KIND_LABEL } from '../lib/customerDoc'
import { Badge, Empty, Field, NumField, Section, Select, Sheet, Toggle } from '../components/ui'
import { SignSheet } from '../components/SignSheet'
import { PendingLink, SendLinkSheet } from '../components/SendLink'
import type { Business, Job, Part, Payment, SignatureKind, Status, WorkOrder, WorkOrderData } from '../lib/types'

export default function OrderEdit({ id, business }: { id: string; business: Business }) {
  const s = withDefaults(business.settings)
  const row = useLive(() => db.work_orders.get(id), [id])
  const rel = useLive(async () => {
    const w = await db.work_orders.get(id)
    return {
      c: w?.customer_id ? await db.customers.get(w.customer_id) : undefined,
      v: w?.vehicle_id ? await db.vehicles.get(w.vehicle_id) : undefined,
      sigs: (await db.signatures.where('work_order_id').equals(id).toArray()).sort((a, b) => a.signed_at.localeCompare(b.signed_at)),
      reqs: (await db.sign_requests.where('work_order_id').equals(id).toArray()).filter((r) => r.status === 'pending'),
    }
  }, [id])
  const [w, commit] = useDraft<WorkOrder>(row, saveWorkOrder)
  const [signing, setSigning] = useState<SignatureKind | null>(null)
  const [sending, setSending] = useState<SignatureKind | null>(null)

  // A signature can arrive from a texted link. Move the status forward here too, so
  // this device never sends back an older status.
  useEffect(() => {
    if (!w || !rel) return
    const has = (k: SignatureKind) => rel.sigs.some((x) => x.kind === k)
    if (has('repair') && ['draft', 'diag_authorized', 'estimate'].includes(w.status)) commit({ ...w, status: 'approved' }, true)
    else if (has('diagnosis') && w.status === 'draft') commit({ ...w, status: 'diag_authorized' }, true)
  }, [rel, w, commit])
  const [paying, setPaying] = useState(false)

  if (row === undefined || !rel) return <Empty>Loading…</Empty>
  if (!row || !w) return <Empty>Work order not found.</Empty>

  const setData = (patch: Partial<WorkOrderData>) => commit({ ...w, data: { ...w.data, ...patch } })
  const setStatus = (status: Status) => commit({ ...w, status }, true)
  const d = w.data
  const t = totals(d)
  const doc = customerDoc(w, business, rel.c, rel.v)
  const sigOf = (k: SignatureKind) => [...rel.sigs].reverse().find((x) => x.kind === k)
  const diagSig = sigOf('diagnosis')
  const repairSig = sigOf('repair')
  const approvedTotal = repairSig ? Number((repairSig.snapshot as { amount?: number }).amount ?? 0) : null
  const overApproved = approvedTotal != null && t.total > approvedTotal + 0.005

  const setJob = (jid: string, patch: Partial<Job>) => setData({ jobs: d.jobs.map((j) => (j.id === jid ? { ...j, ...patch } : j)) })
  const setPart = (j: Job, pid: string, patch: Partial<Part>) =>
    setJob(j.id, { parts: j.parts.map((p) => (p.id === pid ? { ...p, ...patch } : p)) })

  const onSigned = (kind: SignatureKind) => {
    if (kind === 'diagnosis' && w.status === 'draft') setStatus('diag_authorized')
    if (kind === 'repair' && ['draft', 'diag_authorized', 'estimate'].includes(w.status)) setStatus('approved')
  }

  return (
    <div className="stack">
      <div className="topbar">
        <button className="back" onClick={() => go('/orders')}>‹ Work orders</button>
        <button className="secondary small" onClick={() => go(`/orders/${w.id}/print`)}>Customer copy</button>
      </div>
      <div className="spread">
        <div>
          <h1>{woNumber(w, business)}</h1>
          <div className="muted small">Opened {dateTime(w.created_at)}{w.number == null ? ' · number is assigned when it syncs' : ''}</div>
        </div>
        <Badge tone={STATUS[w.status].tone}>{STATUS[w.status].label}</Badge>
      </div>

      <Section>
        <button className="item" style={{ padding: 0, minHeight: 0 }} onClick={() => rel.c && go(`/customers/${rel.c.id}`)}>
          <div><div className="title">{customerName(rel.c)}</div>
            <div className="sub">{[rel.c?.phone, rel.c?.address].filter(Boolean).join(' · ')}</div></div><span className="muted">›</span>
        </button>
        <div><div className="title">{vehicleName(rel.v) || 'No vehicle selected'}</div>
          <div className="sub muted small">{[rel.v?.engine, rel.v?.plate, rel.v?.vin && `VIN ${rel.v.vin}`].filter(Boolean).join(' · ')}</div></div>
        <Field label="Mileage in" value={d.mileageIn} onChange={(mileageIn) => setData({ mileageIn })} inputMode="numeric" />
      </Section>

      <Section title="1. Customer concern">
        <Field label="What's going on with the vehicle?" value={d.complaint} onChange={(complaint) => setData({ complaint })} multiline
          placeholder="e.g. Grinding noise from front when braking" />
      </Section>

      <Section title="2. Diagnosis">
        <div className="grid2">
          <NumField label="Hours" value={d.diag.hours} onChange={(hours) => setData({ diag: { ...d.diag, hours } })} suffix="hr" />
          <NumField label="Rate" value={d.diag.rate} onChange={(rate) => setData({ diag: { ...d.diag, rate } })} prefix="$" suffix="/hr" />
        </div>
        <Toggle label="Credit diagnosis toward repair" hint="Takes the diagnosis fee off the labor if they approve the repair."
          checked={d.diag.creditToRepair} onChange={(creditToRepair) => setData({ diag: { ...d.diag, creditToRepair } })} />
        <Toggle label="Waive diagnosis fee" checked={d.diag.waived} onChange={(waived) => setData({ diag: { ...d.diag, waived } })} />
        {diagSig ? <Signed s={diagSig} /> : <>
          <SignChoice label={`Customer signs: authorize ${money(t.diag)} diagnosis`} onHere={() => setSigning('diagnosis')} onSend={() => setSending('diagnosis')} />
          {rel.reqs.filter((r) => r.kind === 'diagnosis').map((r) => <PendingLink key={r.id} r={r} b={business} c={rel.c} />)}
        </>}
        <Field label="Findings" value={d.findings} onChange={(findings) => setData({ findings })} multiline
          placeholder="What you found. This shows on the customer copy." />
      </Section>

      <Section title="3. Repair estimate" action={
        <button className="small secondary" onClick={() => setData({ jobs: [...d.jobs, { id: uid(), title: '', notes: '', parts: [], laborHours: 1, laborRate: s.laborRate }] })}>+ Add repair</button>}>
        {!d.jobs.length && <p className="muted small">Add each repair you're recommending, with its parts and labor.</p>}
        {d.jobs.map((j, ji) => (
          <div key={j.id} className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="spread"><b>Repair {ji + 1}</b><span className="num"><b>{money(jobTotal(j))}</b></span></div>
            <Field label="Repair" value={j.title} onChange={(title) => setJob(j.id, { title })} placeholder="e.g. Replace front brake pads and rotors" />
            <Field label="Notes for customer (optional)" value={j.notes} onChange={(notes) => setJob(j.id, { notes })} />
            <div className="grid2">
              <NumField label="Labor hours" value={j.laborHours} onChange={(laborHours) => setJob(j.id, { laborHours })} suffix="hr" />
              <NumField label="Labor rate" value={j.laborRate} onChange={(laborRate) => setJob(j.id, { laborRate })} prefix="$" suffix="/hr" />
            </div>
            {j.parts.map((p) => (
              <div key={p.id} className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <div className="row">
                  <div style={{ flex: 2 }}><Field label="Part" value={p.desc} onChange={(desc) => setPart(j, p.id, { desc })} /></div>
                  <div style={{ flex: 1 }}><Field label="Part #" value={p.partNo} onChange={(partNo) => setPart(j, p.id, { partNo })} /></div>
                </div>
                <div className="grid3">
                  <NumField label="Qty" value={p.qty} onChange={(qty) => setPart(j, p.id, { qty })} />
                  <NumField label="Your cost" value={p.cost} prefix="$"
                    onChange={(cost) => setPart(j, p.id, { cost, price: priceFromCost(cost, s.partsMarkupPct) })} />
                  <NumField label="Price (each)" value={p.price} prefix="$" onChange={(price) => setPart(j, p.id, { price })} />
                </div>
                <button className="ghost small" style={{ justifySelf: 'start', color: 'var(--danger)' }}
                  onClick={() => setJob(j.id, { parts: j.parts.filter((x) => x.id !== p.id) })}>Remove part</button>
              </div>
            ))}
            <div className="row wrap">
              <button className="small secondary" onClick={() => setJob(j.id, { parts: [...j.parts, { id: uid(), desc: '', partNo: '', qty: 1, cost: 0, price: 0 }] })}>+ Part</button>
              <button className="small danger" onClick={() => { if (confirm('Remove this repair?')) setData({ jobs: d.jobs.filter((x) => x.id !== j.id) }) }}>Remove repair</button>
            </div>
            <p className="small muted">Price fills in at your cost + {s.partsMarkupPct}% markup. Customers only see the repair total.</p>
          </div>
        ))}
      </Section>

      <Section title="Fees">
        <div className="row wrap">
          {s.feePresets.map((f) => (
            <button key={f.id} className="small secondary" onClick={() => setData({ fees: [...d.fees, { id: uid(), name: f.name, amount: f.amount, taxable: f.taxable }] })}>
              + {f.name} {money(f.amount)}
            </button>
          ))}
          <button className="small secondary" onClick={() => setData({ fees: [...d.fees, { id: uid(), name: 'Fee', amount: 0, taxable: false }] })}>+ Other</button>
        </div>
        {d.fees.map((f) => (
          <div key={f.id} className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}><Field label="Fee" value={f.name} onChange={(name) => setData({ fees: d.fees.map((x) => x.id === f.id ? { ...x, name } : x) })} /></div>
            <div style={{ flex: 1 }}><NumField label="Amount" value={f.amount} prefix="$" onChange={(amount) => setData({ fees: d.fees.map((x) => x.id === f.id ? { ...x, amount } : x) })} /></div>
            <button className="iconbtn danger" aria-label="Remove fee" onClick={() => setData({ fees: d.fees.filter((x) => x.id !== f.id) })}>✕</button>
          </div>
        ))}
      </Section>

      <Section title="Tax">
        <Select label="Tax area" value={s.taxPresets.find((p) => p.name === d.tax.name)?.id ?? ''}
          options={[...s.taxPresets.map((p) => ({ value: p.id, label: `${p.name} (${p.rate}%)` })), { value: '', label: d.tax.name ? `${d.tax.name} (${d.tax.rate}%)` : 'Custom' }]}
          onChange={(pid) => { const p = s.taxPresets.find((x) => x.id === pid); if (p) setData({ tax: { name: p.name, rate: p.rate, taxParts: p.taxParts, taxLabor: p.taxLabor, taxFees: p.taxFees } }) }} />
        <NumField label="Rate for this job" value={d.tax.rate} suffix="%" onChange={(rate) => setData({ tax: { ...d.tax, rate } })} />
        <p className="small muted">Taxing: {[d.tax.taxParts && 'parts', d.tax.taxLabor && 'labor', d.tax.taxFees && 'fees'].filter(Boolean).join(', ') || 'nothing'}. Change what's taxed per area in Settings.</p>
      </Section>

      <Section title="Total">
        <div className="totals">
          {d.jobs.map((j) => <div key={j.id} className="spread"><span>{j.title || 'Repair'}</span><span>{money(jobTotal(j))}</span></div>)}
          {t.diag > 0 && <div className="spread"><span>Diagnosis</span><span>{money(t.diag)}</span></div>}
          {t.diagCredit > 0 && <div className="spread"><span>Diagnosis credit</span><span>−{money(t.diagCredit)}</span></div>}
          {d.fees.map((f) => <div key={f.id} className="spread"><span>{f.name}</span><span>{money(f.amount)}</span></div>)}
          <div className="spread"><span>Tax ({d.tax.rate}%)</span><span>{money(t.tax)}</span></div>
          <div className="spread grand"><span>Total</span><span>{money(t.total)}</span></div>
          {t.paid > 0 && <><div className="spread"><span>Paid</span><span>−{money(t.paid)}</span></div>
            <div className="spread"><b>Balance due</b><b>{money(t.balance)}</b></div></>}
        </div>
        <div className="private">Only you see this: parts cost {money(t.partsCost)} · parts profit {money(t.profitOnParts)} · labor {money(t.labor)}</div>
        {overApproved && <p className="banner">The total is now {money(t.total)}, more than the {money(approvedTotal!)} the customer approved. Get a new signature before doing the extra work.</p>}
        {(!repairSig || overApproved) && d.jobs.length > 0 && (
          <SignChoice label={`Customer signs: approve repair ${money(t.total)}`} onHere={() => setSigning('repair')} onSend={() => setSending('repair')} />
        )}
        {rel.reqs.filter((r) => r.kind === 'repair').map((r) => <PendingLink key={r.id} r={r} b={business} c={rel.c} />)}
        {repairSig && <Signed s={repairSig} />}
      </Section>

      <Section title="Progress">
        <div className="row wrap">
          {w.status === 'draft' && <button className="secondary" onClick={() => setStatus('estimate')}>Mark estimate sent</button>}
          {['approved', 'diag_authorized', 'estimate'].includes(w.status) && <button className="secondary" onClick={() => setStatus('in_progress')}>Start work</button>}
          {['in_progress', 'approved'].includes(w.status) && <button className="secondary" onClick={() => setStatus('completed')}>Mark completed</button>}
          {!['paid', 'void'].includes(w.status) && t.total > 0 && <button onClick={() => setPaying(true)}>Record payment</button>}
          {w.status === 'completed' && !sigOf('completion') && <button className="secondary" onClick={() => setSigning('completion')}>Customer signs: work received</button>}
        </div>
        {d.payments.length > 0 && (
          <div className="list">
            {d.payments.map((p) => (
              <div key={p.id} className="item"><div><div className="title">{money(p.amount)} · {p.method}</div><div className="sub">{dateTime(p.date)}{p.note ? ` · ${p.note}` : ''}</div></div>
                <button className="ghost small" style={{ color: 'var(--danger)' }} onClick={() => {
                  if (!confirm('Remove this payment?')) return
                  const payments = d.payments.filter((x) => x.id !== p.id)
                  commit({ ...w, status: w.status === 'paid' ? 'completed' : w.status, data: { ...d, payments } }, true)
                }}>Remove</button></div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Private notes">
        <Field label="Only you see these" value={d.notes} onChange={(notes) => setData({ notes })} multiline />
      </Section>

      {rel.sigs.length > 0 && (
        <Section title="Signed records">
          {rel.sigs.map((x) => <Signed key={x.id} s={x} />)}
          <p className="small muted">Each signature stores an exact copy of what was agreed to, with a fingerprint (SHA-256) so it can't be changed later.</p>
        </Section>
      )}

      {w.status !== 'void'
        ? <button className="danger" onClick={() => { if (confirm('Void this work order? It keeps its number so your records stay in order.')) setStatus('void') }}>Void work order</button>
        : <button className="secondary" onClick={() => setStatus('draft')}>Reopen work order</button>}

      {sending && <SendLinkSheet kind={sending} w={w} b={business} c={rel.c} v={rel.v} onClose={() => setSending(null)} />}
      {signing && <SignSheet kind={signing} w={w} doc={doc} defaultName={rel.c?.name ?? ''} onClose={() => setSigning(null)} onSigned={() => onSigned(signing)} />}
      {paying && <PaySheet balance={t.balance} onClose={() => setPaying(false)} onPay={(p) => {
        const payments = [...d.payments, p]
        const paid = payments.reduce((sum, x) => sum + x.amount, 0)
        commit({ ...w, status: paid + 0.005 >= t.total ? 'paid' : w.status, data: { ...d, payments } }, true)
        setPaying(false)
      }} />}
    </div>
  )
}

function SignChoice({ label, onHere, onSend }: { label: string; onHere: () => void; onSend: () => void }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button className="block" onClick={onHere}>{label}</button>
      <button className="secondary block" onClick={onSend}>Not with them? Text a signing link</button>
    </div>
  )
}

function Signed({ s }: { s: { kind: SignatureKind; signer_name: string; signed_at: string; image: string; snapshot: unknown; snapshot_hash: string; method?: string } }) {
  const amount = (s.snapshot as { amount?: number })?.amount
  return (
    <div className="signed">
      <div className="spread"><b>✓ {KIND_LABEL[s.kind]}</b>{amount != null && <span className="num">{money(amount)}</span>}</div>
      <img src={s.image} alt={`Signature of ${s.signer_name}`} />
      <div className="small muted">{s.signer_name} · {dateTime(s.signed_at)}{s.method === 'remote' ? ' · signed online' : ''} · #{s.snapshot_hash.slice(0, 10)}</div>
    </div>
  )
}

function PaySheet({ balance, onClose, onPay }: { balance: number; onClose: () => void; onPay: (p: Payment) => void }) {
  const [amount, setAmount] = useState(balance)
  const [method, setMethod] = useState('Card')
  const [note, setNote] = useState('')
  return (
    <Sheet title="Record payment" onClose={onClose}>
      <NumField label="Amount" value={amount} prefix="$" onChange={setAmount} />
      <Select label="Method" value={method} onChange={setMethod}
        options={['Card', 'Cash', 'Zelle', 'Venmo', 'Cash App', 'Check', 'Other'].map((m) => ({ value: m, label: m }))} />
      <Field label="Note (optional)" value={note} onChange={setNote} placeholder="e.g. check #1042" />
      <p className="small muted">Card payments through Stripe are coming in a later step. For now, record how they paid.</p>
      <button className="block" disabled={amount <= 0} onClick={() => onPay({ id: uid(), amount, method, note, date: new Date().toISOString() })}>Save {money(amount)}</button>
    </Sheet>
  )
}
