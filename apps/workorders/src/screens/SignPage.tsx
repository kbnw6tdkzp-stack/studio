import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/money'
import { Field, Toggle } from '../components/ui'
import { SignaturePad } from '../components/SignaturePad'
import { DocView } from '../components/DocView'
import { PdfButton } from '../components/PdfButton'
import type { RemoteDocument, SignatureKind } from '../lib/types'

interface Result {
  error?: string
  status?: 'pending' | 'signed'
  kind?: SignatureKind
  document?: RemoteDocument
  expires_at?: string
  signature?: { signer_name: string; image: string; signed_at: string; snapshot_hash: string } | null
}

const ERRORS: Record<string, string> = {
  not_found: 'This link isn’t valid. Please ask for a new one.',
  cancelled: 'This link was cancelled. Your mechanic may have sent you a newer one.',
  expired: 'This link has expired. Please ask for a new one.',
  name: 'Please type your full name.',
  signature: 'Please sign in the box.',
}

/** Public page the customer opens from the text/email. No account needed. */
export default function SignPage({ token }: { token: string }) {
  const [r, setR] = useState<Result | null>(null)
  const [name, setName] = useState('')
  const [agree, setAgree] = useState(false)
  const [png, setPng] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    setErr('')
    const { data, error } = await supabase.rpc('get_sign_request', { p_token: token })
    if (error) { setErr('Couldn’t load. Check your connection and try again.'); return }
    setR(data as Result)
    if ((data as Result).document && !name) setName((data as Result).document!.doc.customer.name === 'Unnamed customer' ? '' : (data as Result).document!.doc.customer.name)
  }
  useEffect(() => { void load() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const sign = async () => {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('submit_sign_request', { p_token: token, p_name: name.trim(), p_image: png, p_user_agent: navigator.userAgent })
    setBusy(false)
    if (error) { setErr('Couldn’t send your signature. Check your connection and try again.'); return }
    const res = data as Result
    if (res.error) { setErr(ERRORS[res.error] ?? res.error); return }
    setR(res)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!r) return <div className="doc-wrap"><p className="empty">{err || 'Loading…'}</p>{err && <div className="row" style={{ justifyContent: 'center' }}><button onClick={load}>Try again</button></div>}</div>
  if (r.error || !r.document) return <div className="doc-wrap"><div className="doc"><h1>Signing link</h1><p>{ERRORS[r.error ?? ''] ?? 'Something went wrong.'}</p></div></div>

  const d = r.document
  const signed = r.status === 'signed' && r.signature
  return (
    <div className="doc-wrap">
      {signed ? (
        <div className="doc-actions no-print" style={{ display: 'grid', gap: 10 }}>
          <div className="banner" style={{ background: 'color-mix(in srgb, var(--green) 16%, transparent)' }}>
            <b>Signed. Thank you!</b> {d.doc.business.name} has your approval. Keep a copy for your records.
          </div>
          <PdfButton doc={d.doc} logo={d.logo} title={d.label} terms={d.terms} label="Save a copy (PDF)"
            sigs={[{ label: d.label, amount: d.amount, signer_name: r.signature!.signer_name, signed_at: r.signature!.signed_at, image: r.signature!.image, hash: r.signature!.snapshot_hash, remote: true }]} />
        </div>
      ) : (
        <div className="doc-actions no-print"><div className="banner">Please review below, then sign at the bottom to {d.label.toLowerCase()}.</div></div>
      )}
      <DocView doc={d.doc} logo={d.logo} title={d.label} terms={d.terms}
        sigs={signed ? [{ label: d.label, amount: d.amount, signer_name: r.signature!.signer_name, signed_at: r.signature!.signed_at, image: r.signature!.image, hash: r.signature!.snapshot_hash, remote: true }] : []}
        footer={!signed && (
          <section className="stack no-print sign-box">
            <h3>{d.label}: {money(d.amount)}</h3>
            <Field label="Your full name" value={name} onChange={setName} autoComplete="name" />
            <SignaturePad onChange={setPng} />
            <Toggle label={`I have read and agree to the terms above and authorize ${money(d.amount)}`} checked={agree} onChange={setAgree} />
            {err && <p className="error">{err}</p>}
            <button className="block" disabled={busy || !agree || !png || !name.trim()} onClick={sign}>{busy ? 'Sending…' : 'Sign and approve'}</button>
            <p className="small">Signing electronically has the same effect as signing on paper. Your name, signature, the time, and your device are recorded with an exact copy of this document.</p>
          </section>
        )} />
    </div>
  )
}
