import { useEffect, useState } from 'react'
import { useStore, uid } from './store'
import { PRESETS, TEMPLATES } from './templates'
import { deleteDesign, getDesign, listDesigns, cloudEnabled, supabase } from './storage'
import type { Design } from './types'
import Thumb from './Thumb'

export default function Home() {
  const { brand, open, setBrand } = useStore()
  const [designs, setDesigns] = useState<Design[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const refresh = () => listDesigns().then(setDesigns)

  useEffect(() => {
    refresh()
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user.email ?? null))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setUser(s?.user.email ?? null); refresh() })
    return () => data.subscription.unsubscribe()
  }, [])

  const create = (tplId: string) => {
    const t = TEMPLATES.find((x) => x.id === tplId)!
    open({ ...t.build(brand), id: uid(), updatedAt: Date.now() })
  }
  const createBlank = (p: (typeof PRESETS)[number]) =>
    open({ id: uid(), name: p.label, width: p.width, height: p.height, background: brand.colors[3], elements: [], updatedAt: Date.now() })

  const auth = async (mode: 'in' | 'up') => {
    if (!supabase || !email || !password) { setMsg('Enter email and password.'); return }
    const { data, error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
    if (error) setMsg(error.message)
    else if (mode === 'up' && !data.session) setMsg('Check your email to confirm your account, then sign in.')
    else setMsg('')
  }

  return (
    <div className="home">
      <header className="home-top">
        <div className="logo">{brand.logo ? <img src={brand.logo} alt="" /> : <span style={{ background: brand.colors[0] }}>{brand.name[0]}</span>}</div>
        <div>
          <input className="home-title" value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} />
          <input className="home-tag" value={brand.tagline} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} />
        </div>
        <span className="spacer" />
        {cloudEnabled ? (
          user ? (
            <><span className="muted">{user}</span><button className="ghost" onClick={() => supabase!.auth.signOut()}>Sign out</button></>
          ) : (
            <div className="signin">
              <input placeholder="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && auth('in')} />
              <button className="primary" onClick={() => auth('in')}>Sign in</button>
              <button onClick={() => auth('up')}>Sign up</button>
              {msg && <span className="muted small msg">{msg}</span>}
            </div>
          )
        ) : (
          <span className="muted small">Saved in this browser · add Supabase keys to enable sign-in</span>
        )}
      </header>

      <section>
        <h2>Start a design</h2>
        <div className="grid">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="card" onClick={() => create(t.id)}>
              <Thumb d={t.build(brand)} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="chips">
          <span className="muted">Custom size:</span>
          {PRESETS.map((p) => <button key={p.id} className="chip" onClick={() => createBlank(p)}>{p.label} · {p.width}×{p.height}</button>)}
        </div>
      </section>

      <section>
        <h2>Your designs</h2>
        {designs.length === 0 && <p className="muted">Nothing yet. Pick a template above.</p>}
        <div className="list">
          {designs.map((d) => (
            <div key={d.id} className="row-item">
              <button className="linklike" onClick={async () => { const full = await getDesign(d.id); if (full) open(full) }}>{d.name}</button>
              <span className="muted small">{d.width}×{d.height} · {new Date(d.updatedAt).toLocaleString()}</span>
              <span className="spacer" />
              <button className="ghost danger" onClick={() => { if (confirm(`Delete "${d.name}"?`)) deleteDesign(d.id).then(refresh) }}>Delete</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
