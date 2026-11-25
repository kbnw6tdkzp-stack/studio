import { useState } from 'react'
import { Field, Sheet, Toggle } from './ui'
import { SignaturePad } from './SignaturePad'
import { addSignature, canonical, sha256 } from '../lib/repo'
import { uid } from '../lib/defaults'
import { money } from '../lib/money'
import { KIND_LABEL, termsFor, type CustomerDoc } from '../lib/customerDoc'
import type { Signature, SignatureKind, WorkOrder } from '../lib/types'

export function SignSheet({ kind, w, doc, defaultName, onClose, onSigned }: {
  kind: SignatureKind; w: WorkOrder; doc: CustomerDoc; defaultName: string; onClose: () => void; onSigned: (s: Signature) => void
}) {
  const [name, setName] = useState(defaultName)
  const [agree, setAgree] = useState(false)
  const [png, setPng] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const terms = termsFor(kind, w)
  const amount = kind === 'diagnosis' ? doc.diagnosis.amount : doc.totals.total

  const sign = async () => {
    setBusy(true)
    const signedAt = new Date().toISOString()
    const snapshot = { kind, label: KIND_LABEL[kind], signer_name: name.trim(), signed_at: signedAt, terms, amount, document: doc }
    const s: Signature = {
      id: uid(), business_id: w.business_id, work_order_id: w.id, kind, signer_name: name.trim(), image: png!,
      snapshot, snapshot_hash: await sha256(canonical(snapshot)), method: 'in_person',
      user_agent: navigator.userAgent, signed_at: signedAt, created_at: signedAt,
    }
    await addSignature(s)
    onSigned(s)
    onClose()
  }

  return (
    <Sheet title={KIND_LABEL[kind]} onClose={onClose}>
      <p className="muted small">Hand the device to the customer.</p>
      <div className="card">
        <div className="spread"><b>{doc.workOrder.number}</b><span>{doc.vehicle?.description}</span></div>
        {kind === 'diagnosis' ? (
          <div className="spread"><span>Diagnosis ({doc.diagnosis.hours} hr at {money(doc.diagnosis.rate)}/hr)</span><b className="num">{money(amount)}</b></div>
        ) : (
          <>
            {doc.jobs.map((j, i) => <div key={i} className="spread"><span>{j.title || 'Repair'}</span><span className="num">{money(j.total)}</span></div>)}
            {doc.diagnosis.amount > 0 && <div className="spread"><span>Diagnosis</span><span className="num">{money(doc.diagnosis.amount)}</span></div>}
            {doc.diagnosis.credit > 0 && <div className="spread"><span>Diagnosis credit</span><span className="num">−{money(doc.diagnosis.credit)}</span></div>}
            {doc.fees.map((f, i) => <div key={i} className="spread"><span>{f.name}</span><span className="num">{money(f.amount)}</span></div>)}
            <div className="spread"><span>Tax</span><span className="num">{money(doc.tax.amount)}</span></div>
            <div className="spread"><b>Estimated total</b><b className="num">{money(amount)}</b></div>
          </>
        )}
      </div>
      <div className="terms">{terms.join('\n\n')}</div>
      <Field label="Customer’s printed name" value={name} onChange={setName} autoComplete="off" />
      <SignaturePad onChange={setPng} />
      <Toggle label="I have read and agree to the above" checked={agree} onChange={setAgree} />
      <button className="block" disabled={busy || !agree || !png || !name.trim()} onClick={sign}>
        {busy ? 'Saving…' : `Sign and approve ${money(amount)}`}
      </button>
    </Sheet>
  )
}
