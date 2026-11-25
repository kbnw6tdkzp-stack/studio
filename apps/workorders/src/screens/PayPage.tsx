import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startCheckout } from '../lib/payments'
import { money } from '../lib/money'
import { DocView } from '../components/DocView'
import type { RemoteDocument } from '../lib/types'

interface Result {
  error?: string
  status?: 'pending' | 'paid'
  document?: RemoteDocument
  amount?: number
  card_fee?: number
  card_fee_pct?: number
  total?: number
  paid_at?: string | null
}

const ERRORS: Record<string, string> = {
  not_found: 'This pay link isn’t valid. Please ask for a new one.',
  cancelled: 'This pay link was cancelled. You may have been sent a newer one.',
  expired: 'This pay link has expired. Please ask for a new one.',
  not_configured: 'Card payments aren’t set up yet. Please contact the business to pay another way.',
  network: 'Couldn’t reach the payment service. Check your connection and try again.',
}

/** Public page the customer opens from the text or QR code. */
export default function PayPage({ token, returned }: { token: string; returned: boolean }) {
  const [r, setR] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [waiting, setWaiting] = useState(returned)

  const load = async () => {
    const { data, error } = await supabase.rpc('get_pay_request', { p_token: token })
    if (error) { setErr(ERRORS.network); return null }
    setR(data as Result)
    return data as Result
  }

  useEffect(() => {
    let stop = false
    ;(async () => {
      let res = await load()
      // Back from Stripe: the confirmation can take a few seconds to arrive.
      for (let i = 0; returned && !stop && res && res.status !== 'paid' && i < 15; i++) {
        await new Promise((ok) => setTimeout(ok, 2000))
        res = await load()
      }
      setWaiting(false)
    })()
    return () => { stop = true }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const pay = async () => {
    setBusy(true); setErr('')
    const out = await startCheckout(token)
    if (out.url) { location.href = out.url; return }
    setBusy(false)
    if (out.error === 'paid') { void load(); return }
    setErr(ERRORS[out.error ?? ''] ?? out.message ?? 'Something went wrong. Please try again.')
  }

  if (!r) return <div className="doc-wrap"><p className="empty">{err || 'Loading…'}</p></div>
  if (r.error || !r.document) return <div className="doc-wrap"><div className="doc"><h1>Pay link</h1><p>{ERRORS[r.error ?? ''] ?? 'Something went wrong.'}</p></div></div>

  const d = r.document
  const paid = r.status === 'paid'
  return (
    <div className="doc-wrap">
      <div className="doc-actions no-print" style={{ display: 'grid', gap: 10 }}>
        {paid ? <>
          <div className="banner" style={{ background: 'color-mix(in srgb, var(--green) 16%, transparent)' }}>
            <b>Paid. Thank you!</b> {money(Number(r.total))} received by {d.doc.business.name}. Stripe also emails a receipt if you gave your email.
          </div>
          <button onClick={() => window.print()}>Save a copy (PDF)</button>
        </> : waiting ? (
          <div className="banner">Confirming your payment…</div>
        ) : (
          <div className="card" style={{ gap: 6 }}>
            <div className="spread"><span>Amount due</span><span className="num">{money(Number(r.amount))}</span></div>
            {Number(r.card_fee) > 0 && <div className="spread"><span>Card processing fee ({Number(r.card_fee_pct)}%)</span><span className="num">{money(Number(r.card_fee))}</span></div>}
            <div className="spread grand" style={{ fontSize: 20, fontWeight: 700 }}><span>Total by card</span><span className="num">{money(Number(r.total))}</span></div>
            {Number(r.card_fee) > 0 && <p className="small muted" style={{ margin: 0 }}>A {Number(r.card_fee_pct)}% fee applies to card payments. To avoid it, ask about paying another way.</p>}
            {err && <p className="error">{err}</p>}
            <button className="block" disabled={busy} onClick={pay}>{busy ? 'Opening secure checkout…' : `Pay ${money(Number(r.total))}`}</button>
            <p className="small muted" style={{ margin: 0 }}>Secure checkout by Stripe. Card, Apple Pay and Google Pay accepted.</p>
          </div>
        )}
      </div>
      <DocView doc={d.doc} logo={d.logo} title={paid ? 'Receipt' : 'Invoice'} status={paid && r.paid_at ? `Paid ${new Date(r.paid_at).toLocaleDateString()}` : undefined}
        terms={[]} sigs={[]} />
    </div>
  )
}
