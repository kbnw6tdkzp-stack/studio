import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Field } from '../components/ui'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({})
  const redirect = location.origin + location.pathname

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg({})
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
        if (error) throw error
        if (!data.session) setMsg({ info: 'Check your email and tap the confirmation link, then sign in here.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect + '#/settings' })
        if (error) throw error
        setMsg({ info: 'If that email has an account, a reset link is on its way.' })
      }
    } catch (err) {
      setMsg({ error: err instanceof Error ? err.message : String(err) })
    } finally { setBusy(false) }
  }

  return (
    <div className="app">
      <form className="auth stack" onSubmit={submit}>
        <div className="brandmark">WO</div>
        <h1>{mode === 'up' ? 'Create your account' : mode === 'reset' ? 'Reset password' : 'Sign in'}</h1>
        <p className="muted">Your work orders sync to every device you sign in on, and keep working without signal.</p>
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
        {mode !== 'reset' && (
          <Field label="Password" type="password" value={password} onChange={setPassword}
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            hint={mode === 'up' ? 'At least 8 characters. Your iPhone can suggest and save a strong one.' : undefined} />
        )}
        {msg.error && <p className="error">{msg.error}</p>}
        {msg.info && <p className="banner">{msg.info}</p>}
        <button className="block" disabled={busy || !email || (mode !== 'reset' && password.length < 6)}>
          {busy ? 'Please wait…' : mode === 'up' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
        </button>
        <div className="spread">
          <button type="button" className="ghost" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>
            {mode === 'up' ? 'I have an account' : 'Create an account'}
          </button>
          {mode !== 'reset' && <button type="button" className="ghost" onClick={() => setMode('reset')}>Forgot password?</button>}
        </div>
      </form>
    </div>
  )
}
