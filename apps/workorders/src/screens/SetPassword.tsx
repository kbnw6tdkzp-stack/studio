import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Field } from '../components/ui'

/** Shown after tapping a password-reset email link. */
export default function SetPassword({ email, onDone }: { email: string; onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) { setErr('The two passwords don’t match.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(true)
  }

  return (
    <div className="app">
      <form className="auth stack" onSubmit={save}>
        <div className="brandmark">WO</div>
        {done ? <>
          <h1>Password changed</h1>
          <p className="muted">Use your new password to sign in on your other devices, including the Work Orders icon on your home screen.</p>
          <button type="button" className="block" onClick={onDone}>Continue</button>
        </> : <>
          <h1>Choose a new password</h1>
          <p className="muted">For {email}</p>
          {/* Hidden username helps iPhone save the new password to the right account. */}
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <Field label="New password" type="password" value={pw} onChange={setPw} autoComplete="new-password"
            hint="At least 8 characters. Your iPhone can suggest and save a strong one." />
          <Field label="Type it again" type="password" value={pw2} onChange={setPw2} autoComplete="new-password" />
          {err && <p className="error">{err}</p>}
          <button className="block" disabled={busy || pw.length < 8 || !pw2}>{busy ? 'Saving…' : 'Save new password'}</button>
        </>}
      </form>
    </div>
  )
}
