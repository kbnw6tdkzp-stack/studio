import { useEffect, useState } from 'react'
import { Field, Sheet, Toggle } from './ui'
import { saveCustomer } from '../lib/repo'
import { cancelSignRequest, createSignRequest, linkFor, shareText } from '../lib/remoteSign'
import { KIND_LABEL } from '../lib/customerDoc'
import { money } from '../lib/money'
import { dateTime } from '../lib/format'
import type { Business, Customer, SignatureKind, SignRequest, Vehicle, WorkOrder } from '../lib/types'

const isApple = /iPhone|iPad|Macintosh/.test(navigator.userAgent)
export const smsHref = (phone: string, body: string) => `sms:${phone.replace(/[^\d+]/g, '')}${isApple ? '&' : '?'}body=${encodeURIComponent(body)}`

export function ShareButtons({ text, subject, url, customer }: { text: string; subject: string; url: string; customer?: Customer | null }) {
  const [copied, setCopied] = useState(false)
  const textTo = customer?.mobile?.trim() || customer?.phone?.trim() || ''
  const [other, setOther] = useState(!textTo)
  const [num, setNum] = useState('')
  const [remember, setRemember] = useState(true)
  const digits = num.replace(/\D/g, '')
  return (
    <div className="stack" style={{ gap: 8 }}>
      {textTo && <a className="btn" href={smsHref(textTo, text)}>Text to {textTo}</a>}
      {other ? (
        <div className="card" style={{ gap: 8 }}>
          <Field label={textTo ? 'Text a different number' : 'Text to (cell number)'} value={num} onChange={setNum} type="tel" inputMode="tel" placeholder="Cell number" />
          {customer && <Toggle label={`Remember as ${customer.name || 'this customer'}’s cell`} checked={remember} onChange={setRemember} />}
          {digits.length >= 10
            ? <a className="btn" href={smsHref(num, text)} onClick={() => { if (customer && remember) void saveCustomer({ ...customer, mobile: num.trim() }) }}>Text to {num.trim()}</a>
            : <button disabled>Enter a 10-digit number</button>}
        </div>
      ) : (
        <button className="ghost" onClick={() => setOther(true)}>Text a different number…</button>
      )}
      {typeof navigator.share === 'function' && (
        <button className="secondary" onClick={() => navigator.share({ title: subject, text }).catch(() => {})}>Share… (Messages, WhatsApp, Mail)</button>
      )}
      {customer?.email && <a className="btn secondary" href={`mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>Email to {customer.email}</a>}
      <button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true) } catch { prompt('Copy this link', url) } }}>
        {copied ? 'Link copied' : 'Copy link'}</button>
    </div>
  )
}

export function SendLinkSheet({ kind, w, b, c, v, onClose }: {
  kind: SignatureKind; w: WorkOrder; b: Business; c?: Customer | null; v?: Vehicle | null; onClose: () => void
}) {
  const [state, setState] = useState<{ url?: string; amount?: number; error?: string }>({})
  useEffect(() => {
    createSignRequest(kind, w, b, c, v)
      .then(({ request, url }) => setState({ url, amount: request.document.amount }))
      .catch((e) => setState({ error: e instanceof Error ? e.message : String(e) }))
    // Create once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <Sheet title={`Send for signature: ${KIND_LABEL[kind]}`} onClose={onClose}>
      {state.error ? <p className="error">{state.error}</p>
        : !state.url ? <p className="muted">Creating a secure link…</p>
        : <>
            <p>The customer opens this on their phone, reviews the work order, and signs with their finger. No app or account needed. It shows up here once they sign.</p>
            <ShareButtons text={shareText(b, kind, money(state.amount ?? 0), state.url)} subject={`${KIND_LABEL[kind]} – ${b.name}`} url={state.url} customer={c} />
            <p className="small muted">The link works for 14 days, once. It shows exactly what's on this work order now, without your cost. If you change the price, send a new link.</p>
          </>}
    </Sheet>
  )
}

/** Status line for a link you've sent, with options to resend or cancel. */
export function PendingLink({ r, b, c }: { r: SignRequest; b: Business; c?: Customer | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { void linkFor(r.id).then((u) => setUrl(u ?? null)) }, [r.id])
  const expired = new Date(r.expires_at) < new Date()
  return (
    <div className="signed">
      <div className="spread"><b>Link sent for {money(r.document.amount)}</b><span className="badge amber">{expired ? 'Expired' : r.viewed_at ? 'Opened' : 'Not opened yet'}</span></div>
      <div className="small muted">Sent {dateTime(r.created_at)}{r.viewed_at ? ` · opened ${dateTime(r.viewed_at)}` : ''} · waiting for signature</div>
      <div className="row wrap">
        {url && !expired && <button className="small secondary" onClick={() => setOpen(true)}>Send again</button>}
        <button className="small danger" onClick={async () => { try { await cancelSignRequest(r) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } }}>Cancel link</button>
      </div>
      {err && <p className="error">{err}</p>}
      {open && url && (
        <Sheet title="Send again" onClose={() => setOpen(false)}>
          <ShareButtons text={shareText(b, r.kind, money(r.document.amount), url)} subject={`${KIND_LABEL[r.kind]} – ${b.name}`} url={url} customer={c} />
        </Sheet>
      )}
    </div>
  )
}
