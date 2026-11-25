import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Field({ label, value, onChange, type = 'text', placeholder, multiline, autoComplete, inputMode, hint }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
  multiline?: boolean; autoComplete?: string; inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal'; hint?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline
        ? <textarea value={value} placeholder={placeholder} rows={4} onChange={(e) => onChange(e.target.value)} />
        : <input value={value} type={type} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode}
            onChange={(e) => onChange(e.target.value)} />}
      {hint && <small>{hint}</small>}
    </label>
  )
}

/** Number input that lets you clear and retype without snapping to 0. */
export function NumField({ label, value, onChange, prefix, suffix, step = 'any' }: {
  label: string; value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; step?: string
}) {
  const [text, setText] = useState(String(value ?? 0))
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setText(String(value ?? 0)) }, [value])
  return (
    <label className="field">
      <span>{label}</span>
      <div className="affix">
        {prefix && <i>{prefix}</i>}
        <input inputMode="decimal" type="text" step={step} value={text}
          onFocus={(e) => { focused.current = true; e.target.select() }}
          onBlur={() => { focused.current = false; setText(String(value ?? 0)) }}
          onChange={(e) => {
            const t = e.target.value.replace(/[^0-9.\-]/g, '')
            setText(t)
            const n = parseFloat(t)
            onChange(Number.isFinite(n) ? n : 0)
          }} />
        {suffix && <i>{suffix}</i>}
      </div>
    </label>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle">
      <div><span>{label}</span>{hint && <small>{hint}</small>}</div>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function Select<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function Section({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card">
      {(title || action) && <header className="card-head"><h2>{title}</h2>{action}</header>}
      {children}
    </section>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head"><h2>{title}</h2><button className="ghost" onClick={onClose}>Close</button></header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export const Badge = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`badge ${tone}`}>{children}</span>

export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>
