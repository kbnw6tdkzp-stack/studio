import { useState } from 'react'
import { db } from '../lib/db'
import { useLive } from '../lib/hooks'
import { money, totals } from '../lib/money'
import { customerName, vehicleName, woNumber, STATUS } from '../lib/format'
import { Section, Select } from '../components/ui'
import { SyncBadge } from '../components/SyncBadge'
import type { Business } from '../lib/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Money({ business }: { business: Business }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const data = useLive(async () => {
    const [ws, cs, vs] = await Promise.all([
      db.work_orders.where('business_id').equals(business.id).filter((w) => !w.deleted_at && w.status !== 'void').toArray(),
      db.customers.where('business_id').equals(business.id).toArray(),
      db.vehicles.where('business_id').equals(business.id).toArray(),
    ])
    return { ws, cs: new Map(cs.map((c) => [c.id, c])), vs: new Map(vs.map((v) => [v.id, v])) }
  }, [business.id])
  if (!data) return null

  const years = new Set<number>([new Date().getFullYear()])
  const months = MONTHS.map(() => ({ collected: 0, jobs: 0 }))
  let collected = 0, tax = 0, partsCost = 0, partsSold = 0, labor = 0, jobs = 0, outstanding = 0
  for (const w of data.ws) {
    years.add(new Date(w.created_at).getFullYear())
    const t = totals(w.data)
    for (const p of w.data.payments) {
      const d = new Date(p.date)
      years.add(d.getFullYear())
      if (d.getFullYear() === year) { collected += p.amount; months[d.getMonth()].collected += p.amount }
    }
    if (w.status === 'paid' && w.paid_at && new Date(w.paid_at).getFullYear() === year) {
      tax += t.tax; partsCost += t.partsCost; partsSold += t.parts; labor += t.labor + t.diag - t.diagCredit; jobs++
      months[new Date(w.paid_at).getMonth()].jobs++
    }
    if (['completed', 'in_progress', 'approved', 'diag_authorized'].includes(w.status) && t.balance > 0) outstanding += t.balance
  }
  const max = Math.max(1, ...months.map((m) => m.collected))

  const exportCsv = () => {
    const rows = [['Number', 'Opened', 'Status', 'Customer', 'Vehicle', 'Subtotal', 'Tax', 'Total', 'Paid', 'Balance', 'Parts cost', 'Paid on']]
    for (const w of data.ws.filter((x) => new Date(x.created_at).getFullYear() === year || (x.paid_at && new Date(x.paid_at).getFullYear() === year))
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))) {
      const t = totals(w.data)
      rows.push([woNumber(w, business), w.created_at.slice(0, 10), STATUS[w.status].label, customerName(data.cs.get(w.customer_id ?? '')),
        vehicleName(data.vs.get(w.vehicle_id ?? '')), t.subtotal, t.tax, t.total, t.paid, t.balance, t.partsCost, w.paid_at?.slice(0, 10) ?? '']
        .map(String))
    }
    const csv = rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `work-orders-${year}.csv`
    a.click()
  }

  return (
    <div className="stack">
      <div className="topbar"><h1>Money</h1><SyncBadge /></div>
      <Select label="Year" value={String(year)} onChange={(y) => setYear(Number(y))}
        options={[...years].sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) }))} />
      <div className="stats">
        <div className="stat"><b>{money(collected)}</b><span>Collected in {year}</span></div>
        <div className="stat"><b>{money(outstanding)}</b><span>Owed to you now</span></div>
        <div className="stat"><b>{money(labor)}</b><span>Labor & diagnosis</span></div>
        <div className="stat"><b>{money(partsSold - partsCost)}</b><span>Parts profit ({money(partsSold)} sold)</span></div>
        <div className="stat"><b>{money(partsCost)}</b><span>Parts cost (expense)</span></div>
        <div className="stat"><b>{money(tax)}</b><span>Sales tax collected</span></div>
      </div>
      <Section title="By month">
        <div className="stack" style={{ gap: 6 }}>
          {months.map((m, i) => (
            <div key={i} className="row" style={{ gap: 8 }}>
              <span className="small muted" style={{ width: 30 }}>{MONTHS[i]}</span>
              <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, height: 18 }}>
                <div style={{ width: `${(m.collected / max) * 100}%`, background: 'var(--accent)', height: '100%', borderRadius: 6 }} />
              </div>
              <span className="small num" style={{ width: 90, textAlign: 'right' }}>{money(m.collected)}</span>
            </div>
          ))}
        </div>
        <p className="small muted">{jobs} jobs paid in full in {year}. "Collected" counts money on the day you received it.</p>
      </Section>
      <button className="secondary block" onClick={exportCsv}>Export {year} to spreadsheet (CSV)</button>
      <p className="small muted">For your tax preparer: collected income, parts cost and sales tax collected. This isn't tax advice.</p>
    </div>
  )
}
