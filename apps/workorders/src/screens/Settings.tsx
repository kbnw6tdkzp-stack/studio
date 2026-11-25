import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { useDraft, useLive, useSyncState } from '../lib/hooks'
import { saveBusiness, saveProfile } from '../lib/repo'
import { supabase } from '../lib/supabase'
import { syncNow } from '../lib/sync'
import { uid, withDefaults, defaultSettings } from '../lib/defaults'
import { ENTITY, dateTime } from '../lib/format'
import { logoUrl } from '../lib/logo'
import { stripeStatus } from '../lib/payments'
import { Field, NumField, Section, Select, Toggle } from '../components/ui'
import type { Business, Profile, Settings as S } from '../lib/types'

export default function Settings({ business, user }: { business: Business; user: { id: string; email: string } }) {
  const [draft, commitB] = useDraft<Business>(business, saveBusiness, 500)
  const b = draft ?? business
  const s = withDefaults(b.settings)
  const setBiz = (patch: Partial<Business>) => commitB({ ...b, ...patch })
  const setS = (patch: Partial<S>) => setBiz({ settings: { ...s, ...patch } })

  return (
    <div className="stack">
      <div className="topbar"><h1>Settings</h1></div>

      <Section title="Business">
        <Logo b={b} onChange={(logo_path) => setBiz({ logo_path })} />
        <Field label="Business name" value={b.name} onChange={(name) => setBiz({ name })} />
        <Select label="Business type" value={b.entity_type} onChange={(entity_type) => setBiz({ entity_type })}
          options={Object.entries(ENTITY).map(([value, label]) => ({ value: value as Business['entity_type'], label }))} />
        {b.entity_type !== 'sole_proprietor' && (
          <Field label="Legal name (as registered)" value={b.legal_name} onChange={(legal_name) => setBiz({ legal_name })}
            hint="Shown on your work orders so contracts are with your LLC, not you personally." />
        )}
        <Field label="License / registration number" value={b.license_number} onChange={(license_number) => setBiz({ license_number })}
          hint="e.g. California BAR automotive repair dealer number." />
        <div className="grid2">
          <Field label="Phone" value={b.phone} onChange={(phone) => setBiz({ phone })} type="tel" inputMode="tel" />
          <Field label="Email" value={b.email} onChange={(email) => setBiz({ email })} type="email" inputMode="email" />
        </div>
        <Field label="Address" value={b.address} onChange={(address) => setBiz({ address })} />
        <Field label="Website" value={b.website} onChange={(website) => setBiz({ website })} />
      </Section>

      <PersonalInfo userId={user.id} email={user.email} />

      <Section title="Rates">
        <div className="grid2">
          <NumField label="Labor rate" value={s.laborRate} prefix="$" suffix="/hr" onChange={(laborRate) => setS({ laborRate })} />
          <NumField label="Parts markup" value={s.partsMarkupPct} suffix="%" onChange={(partsMarkupPct) => setS({ partsMarkupPct })} />
          <NumField label="Diagnosis rate" value={s.diagRate} prefix="$" suffix="/hr" onChange={(diagRate) => setS({ diagRate })} />
          <NumField label="Diagnosis hours" value={s.diagHours} suffix="hr" onChange={(diagHours) => setS({ diagHours })} />
        </div>
        <p className="small muted">New work orders start with these. Changing them doesn't touch existing work orders.</p>
      </Section>

      <Section title="Tax areas" action={<button className="small secondary" onClick={() => setS({ taxPresets: [...s.taxPresets, { id: uid(), name: 'New area', rate: 0, taxParts: true, taxLabor: false, taxFees: false }] })}>+ Add</button>}>
        <p className="small muted">Add one for each city or county you work in, with the full combined rate. In both California and Nevada, repair labor is usually not taxed and parts are. Check your local rate with the state tax agency (CDTFA or Nevada Department of Taxation).</p>
        {s.taxPresets.map((p) => {
          const upd = (patch: Partial<typeof p>) => setS({ taxPresets: s.taxPresets.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) })
          return (
            <div key={p.id} className="card" style={{ background: 'var(--surface-2)' }}>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div style={{ flex: 2 }}><Field label="Area" value={p.name} onChange={(name) => upd({ name })} /></div>
                <div style={{ flex: 1 }}><NumField label="Rate" value={p.rate} suffix="%" onChange={(rate) => upd({ rate })} /></div>
              </div>
              <div className="grid3">
                <Toggle label="Parts" checked={p.taxParts} onChange={(taxParts) => upd({ taxParts })} />
                <Toggle label="Labor" checked={p.taxLabor} onChange={(taxLabor) => upd({ taxLabor })} />
                <Toggle label="Fees" checked={p.taxFees} onChange={(taxFees) => upd({ taxFees })} />
              </div>
              <div className="row">
                <button className="small secondary" disabled={s.defaultTaxPresetId === p.id} onClick={() => setS({ defaultTaxPresetId: p.id })}>
                  {s.defaultTaxPresetId === p.id ? 'Default' : 'Make default'}</button>
                <button className="small danger" onClick={() => setS({ taxPresets: s.taxPresets.filter((x) => x.id !== p.id) })}>Remove</button>
              </div>
            </div>
          )
        })}
      </Section>

      <Section title="Fees (disposal, shop supplies…)" action={<button className="small secondary" onClick={() => setS({ feePresets: [...s.feePresets, { id: uid(), name: 'New fee', amount: 0, taxable: false }] })}>+ Add</button>}>
        {s.feePresets.map((f) => {
          const upd = (patch: Partial<typeof f>) => setS({ feePresets: s.feePresets.map((x) => (x.id === f.id ? { ...x, ...patch } : x)) })
          return (
            <div key={f.id} className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}><Field label="Fee" value={f.name} onChange={(name) => upd({ name })} /></div>
              <div style={{ flex: 1 }}><NumField label="Amount" value={f.amount} prefix="$" onChange={(amount) => upd({ amount })} /></div>
              <button className="iconbtn danger" aria-label="Remove fee" onClick={() => setS({ feePresets: s.feePresets.filter((x) => x.id !== f.id) })}>✕</button>
            </div>
          )
        })}
        <p className="small muted">In California, a hazardous waste fee (oil, coolant, etc.) may need to be listed as its own line. Ask your local BAR office if you're not sure.</p>
      </Section>

      <Section title="Fine print">
        <Field label="Diagnosis authorization" value={s.terms.diagnosis} onChange={(diagnosis) => setS({ terms: { ...s.terms, diagnosis } })} multiline />
        <Field label="Repair authorization" value={s.terms.repair} onChange={(repair) => setS({ terms: { ...s.terms, repair } })} multiline />
        <Field label="General terms (valuables, liability, disposal, payment)" value={s.terms.general} onChange={(general) => setS({ terms: { ...s.terms, general } })} multiline />
        <div className="row">
          <button className="small secondary" onClick={() => { if (confirm('Replace your fine print with the starting text?')) setS({ terms: defaultSettings().terms }) }}>Reset to starting text</button>
        </div>
        <p className="small muted">Each new work order copies this text, and every signature locks in exactly what the customer saw. Have a local attorney review it.</p>
      </Section>

      <Section title="What customers see">
        <Select label="Prices on customer copies" value={s.customerView} onChange={(customerView) => setS({ customerView })}
          options={[
            { value: 'combined', label: 'One price per repair (parts + labor together)' },
            { value: 'itemized', label: 'Parts and labor subtotals per repair' },
          ]} />
        <p className="small muted">Your cost and markup are never shown either way. California law requires final invoices to list parts and labor separately, so switch to the second option there if your invoices must comply.</p>
      </Section>

      <Payments s={s} setS={setS} />
      <Numbering b={b} prefix={s.numberPrefix} pad={s.numberPad} setS={setS} />
      <Appearance />
      <Account email={user.email} />
    </div>
  )
}

function Logo({ b, onChange }: { b: Business; onChange: (path: string | null) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const url = logoUrl(b.logo_path)
  const upload = async (file: File) => {
    setBusy(true); setErr('')
    try {
      const small = await shrink(file, 600)
      const path = `${b.id}/logo-${Date.now()}.png`
      const { error } = await supabase.storage.from('logos').upload(path, small, { contentType: 'image/png', upsert: true })
      if (error) throw error
      onChange(path)
    } catch (e) { setErr(navigator.onLine ? (e instanceof Error ? e.message : String(e)) : 'Connect to the internet to upload a logo.') }
    finally { setBusy(false) }
  }
  return (
    <div className="row">
      {url ? <img className="logo-preview" src={url} alt="Business logo" /> : <div className="logo-preview" />}
      <div className="stack" style={{ gap: 6 }}>
        <label className="secondary" style={{ display: 'inline-grid', placeItems: 'center', minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', fontWeight: 600, cursor: 'pointer' }}>
          {busy ? 'Uploading…' : url ? 'Change logo' : 'Add logo'}
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
        </label>
        {url && <button className="ghost small" onClick={() => onChange(null)}>Remove</button>}
        {err && <span className="error">{err}</span>}
      </div>
    </div>
  )
}

async function shrink(file: File, max: number): Promise<Blob> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that image'))), 'image/png'))
}

function PersonalInfo({ userId, email }: { userId: string; email: string }) {
  const stored = useLive(async () => (await db.profiles.get(userId)) ?? { user_id: userId, full_name: '', phone: '', email, address: '', title: '', updated_at: '' }, [userId])
  const [p, commitP] = useDraft<Profile>(stored, saveProfile, 500)
  if (!p) return null
  const set = (patch: Partial<Profile>) => commitP({ ...p, ...patch })
  return (
    <Section title="Personal information">
      <div className="grid2">
        <Field label="Full name" value={p.full_name} onChange={(full_name) => set({ full_name })} autoComplete="name" />
        <Field label="Title" value={p.title} onChange={(title) => set({ title })} placeholder="Owner / Technician" />
        <Field label="Phone" value={p.phone} onChange={(phone) => set({ phone })} type="tel" inputMode="tel" />
        <Field label="Email" value={p.email} onChange={(email) => set({ email })} type="email" inputMode="email" />
      </div>
      <Field label="Home address (private)" value={p.address} onChange={(address) => set({ address })} />
    </Section>
  )
}

function Numbering({ b, prefix, pad, setS }: { b: Business; prefix: string; pad: number; setS: (p: Partial<S>) => void }) {
  const [next, setNext] = useState<number | null>(null)
  const [want, setWant] = useState(0)
  const [msg, setMsg] = useState('')
  const sync = useSyncState()
  useEffect(() => {
    if (!sync.online) return
    supabase.rpc('get_next_work_order_number', { p_business: b.id }).then(({ data }) => { if (typeof data === 'number') { setNext(data); setWant(data) } })
  }, [b.id, sync.online, sync.lastSync])
  return (
    <Section title="Work order numbers">
      <div className="grid2">
        <Field label="Prefix" value={prefix} onChange={(numberPrefix) => setS({ numberPrefix })} />
        <NumField label="Digits" value={pad} onChange={(numberPad) => setS({ numberPad: Math.max(1, Math.min(8, Math.round(numberPad))) })} />
      </div>
      <p className="small muted">Looks like: <b>{prefix}{String(next ?? 1).padStart(pad, '0')}</b>. Numbers are given out by the server one at a time, so they never repeat or skip, even across devices. Voided orders keep their number.</p>
      {next != null ? (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}><NumField label="Next number" value={want} onChange={(n) => setWant(Math.round(n))} /></div>
          <button className="secondary" style={{ marginBottom: 0 }} disabled={want === next} onClick={async () => {
            const { error } = await supabase.rpc('set_next_work_order_number', { p_business: b.id, p_next: want })
            if (error) setMsg(error.message); else { setNext(want); setMsg('Saved.') }
          }}>Set</button>
        </div>
      ) : <p className="small muted">Connect to the internet to change the next number.</p>}
      {msg && <p className="small">{msg}</p>}
    </Section>
  )
}

function Appearance() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('theme') ?? 'system' } catch { return 'system' } })
  const apply = (t: string) => {
    setTheme(t)
    try { localStorage.setItem('theme', t) } catch { /* private mode */ }
    if (t === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
  }
  return (
    <Section title="Appearance">
      <div className="seg">
        {[['system', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => (
          <button key={k} className={theme === k ? 'on' : ''} onClick={() => apply(k)}>{l}</button>
        ))}
      </div>
    </Section>
  )
}

function Account({ email }: { email: string }) {
  const sync = useSyncState()
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  return (
    <Section title="Account">
      <div className="spread"><span>Signed in as</span><b>{email}</b></div>
      <div className="spread"><span className="muted small">
        {sync.online ? (sync.lastSync ? `Last synced ${dateTime(sync.lastSync)}` : 'Not synced yet') : 'Offline'}
        {sync.pending ? ` · ${sync.pending} waiting to upload` : ''}</span>
        <button className="small secondary" onClick={() => void syncNow()}>Sync now</button></div>
      {sync.error && <p className="error">{sync.error}</p>}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}><Field label="New password" type="password" value={pw} onChange={setPw} autoComplete="new-password" /></div>
        <button className="secondary" disabled={pw.length < 8} onClick={async () => {
          const { error } = await supabase.auth.updateUser({ password: pw })
          setMsg(error ? error.message : 'Password changed.'); setPw('')
        }}>Change</button>
      </div>
      {msg && <p className="small">{msg}</p>}
      <button className="danger" onClick={async () => {
        if (sync.pending && !confirm(`${sync.pending} changes haven't uploaded yet and will be lost. Sign out anyway?`)) return
        await supabase.auth.signOut()
        await Promise.all(db.tables.map((t) => t.clear()))
      }}>Sign out</button>
    </Section>
  )
}

function Payments({ s, setS }: { s: S; setS: (p: Partial<S>) => void }) {
  const [status, setStatus] = useState<{ configured: boolean; mode: 'test' | 'live' | null } | null | undefined>(undefined)
  useEffect(() => { void stripeStatus().then(setStatus) }, [])
  return (
    <Section title="Card payments (Stripe)">
      <div className="spread">
        <span>Stripe</span>
        {status === undefined ? <span className="muted small">Checking…</span>
          : !status ? <span className="muted small">Can’t check while offline</span>
          : !status.configured ? <span className="badge red">Not connected</span>
          : status.mode === 'live' ? <span className="badge green">Connected · live</span>
          : <span className="badge amber">Connected · test mode</span>}
      </div>
      {status && !status.configured && <p className="small muted">Add your Stripe secret key in Supabase (Edge Functions › Secrets, named STRIPE_SECRET_KEY). See the setup steps in the app’s README.</p>}
      {status?.mode === 'test' && <p className="small muted">Test mode: use card 4242 4242 4242 4242, any future date, any CVC. No real money moves. Switch to your live key when you’re ready.</p>}
      <Toggle label="Add a card processing fee" hint="Added to the total when the customer pays by card, shown before they pay." checked={s.cardFeeEnabled} onChange={(cardFeeEnabled) => setS({ cardFeeEnabled })} />
      {s.cardFeeEnabled && <NumField label="Card fee" value={s.cardFeePct} suffix="%" onChange={(n) => setS({ cardFeePct: Math.max(0, Math.min(10, n)) })} />}
      {s.cardFeeEnabled && <p className="small muted">Card brands generally cap surcharges at 3% and don’t allow them on debit cards, and some require notice before you start. Check the current rules for California and Nevada with Stripe or your accountant.</p>}
    </Section>
  )
}
