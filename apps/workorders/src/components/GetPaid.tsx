import { useEffect, useState } from 'react'
import { renderSVG } from 'uqr'
import { Sheet } from './ui'
import { ShareButtons } from './SendLink'
import { cancelPayRequest, createPayRequest, payLinkFor } from '../lib/payments'
import { money } from '../lib/money'
import { dateTime } from '../lib/format'
import type { Business, Customer, PayRequest, Vehicle, WorkOrder } from '../lib/types'

const payText = (b: Business, number: string, total: number, url: string) =>
  `${b.name || 'Your mechanic'}: your invoice ${number} is ready. Pay ${money(total)} by card or Apple Pay here: ${url}`

function PayLinkView({ b, r, url, c }: { b: Business; r: PayRequest; url: string; c?: Customer | null }) {
  const total = Number(r.amount) + Number(r.card_fee)
  return (
    <div className="stack">
      <div className="card" style={{ gap: 4 }}>
        <div className="spread"><span>Balance</span><span className="num">{money(Number(r.amount))}</span></div>
        {Number(r.card_fee) > 0 && <div className="spread"><span>Card fee ({Number(r.card_fee_pct)}%)</span><span className="num">{money(Number(r.card_fee))}</span></div>}
        <div className="spread"><b>Customer pays by card</b><b className="num">{money(total)}</b></div>
      </div>
      <div className="qr" aria-label="QR code for the pay link" dangerouslySetInnerHTML={{ __html: renderSVG(url, { border: 2 }) }} />
      <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>With them? Have them scan this with their phone camera.</p>
      <ShareButtons text={payText(b, r.document.doc.workOrder.number, total, url)} subject={`Invoice ${r.document.doc.workOrder.number} – ${b.name}`} url={url} customer={c} />
    </div>
  )
}

export function GetPaidSheet({ w, b, c, v, onClose, onRecordOther }: {
  w: WorkOrder; b: Business; c?: Customer | null; v?: Vehicle | null; onClose: () => void; onRecordOther: () => void
}) {
  const [state, setState] = useState<{ r?: PayRequest; url?: string; error?: string }>({})
  useEffect(() => {
    createPayRequest(w, b, c, v).then(({ request, url }) => setState({ r: request, url }))
      .catch((e) => setState({ error: e instanceof Error ? e.message : String(e) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <Sheet title="Get paid by card" onClose={onClose}>
      {state.error ? <p className="error">{state.error}</p>
        : !state.r || !state.url ? <p className="muted">Creating a secure pay link…</p>
        : <PayLinkView b={b} r={state.r} url={state.url} c={c} />}
      <button className="secondary" onClick={onRecordOther}>Paid another way? Record cash, Zelle, check…</button>
      <p className="small muted">The work order is marked paid on its own once Stripe confirms the payment.</p>
    </Sheet>
  )
}

export function PendingPay({ r, b, c }: { r: PayRequest; b: Business; c?: Customer | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { void payLinkFor(r.id).then((u) => setUrl(u ?? null)) }, [r.id])
  const expired = new Date(r.expires_at) < new Date()
  return (
    <div className="signed">
      <div className="spread"><b>Pay link for {money(Number(r.amount) + Number(r.card_fee))}</b><span className="badge amber">{expired ? 'Expired' : r.viewed_at ? 'Opened' : 'Not opened yet'}</span></div>
      <div className="small muted">Sent {dateTime(r.created_at)}{r.viewed_at ? ` · opened ${dateTime(r.viewed_at)}` : ''} · waiting for payment</div>
      <div className="row wrap">
        {url && !expired && <button className="small secondary" onClick={() => setOpen(true)}>Show QR / send again</button>}
        <button className="small danger" onClick={async () => { try { await cancelPayRequest(r) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } }}>Cancel link</button>
      </div>
      {err && <p className="error">{err}</p>}
      {open && url && <Sheet title="Pay link" onClose={() => setOpen(false)}><PayLinkView b={b} r={r} url={url} c={c} /></Sheet>}
    </div>
  )
}
