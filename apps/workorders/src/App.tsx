import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { db, getMeta, setMeta } from './lib/db'
import { pullAccount, startSync, stopSync } from './lib/sync'
import { useLive, useRoute } from './lib/hooks'
import Login from './screens/Login'
import Onboarding from './screens/Onboarding'
import Orders from './screens/Orders'
import OrderEdit from './screens/OrderEdit'
import PrintView from './screens/PrintView'
import Customers from './screens/Customers'
import CustomerDetail from './screens/CustomerDetail'
import Money from './screens/Money'
import Settings from './screens/Settings'
import { Tabs } from './components/Tabs'

type CachedUser = { id: string; email: string }

export default function App() {
  const [user, setUser] = useState<CachedUser | null | undefined>(undefined)
  const [checking, setChecking] = useState(false)
  const businesses = useLive(() => db.businesses.filter((b) => !b.deleted_at).toArray(), [])
  const business = businesses?.[0]

  useEffect(() => {
    const apply = async (u: User | null) => {
      if (u) {
        const prev = await getMeta<CachedUser>('user')
        // A different person signing in on this device starts with a clean local copy.
        if (prev && prev.id !== u.id) await Promise.all(db.tables.map((t) => t.clear()))
        const cu = { id: u.id, email: u.email ?? '' }
        await setMeta('user', cu)
        setUser(cu)
      } else {
        setUser(null)
      }
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) return apply(data.session.user)
      // No connection? Stay signed in with what this device remembers.
      const cached = await getMeta<CachedUser>('user')
      if (cached && !navigator.onLine) setUser(cached)
      else setUser(null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { void setMeta('user', null); setUser(null) }
      else if (session?.user) void apply(session.user)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // First time on a new device: fetch the business from the cloud before deciding to show setup.
  useEffect(() => {
    if (!user) { stopSync(); return }
    let cancelled = false
    ;(async () => {
      if (!(await db.businesses.count()) && navigator.onLine) {
        setChecking(true)
        try { await pullAccount(user.id) } catch (e) { console.error(e) }
        if (!cancelled) setChecking(false)
      }
      const b = await db.businesses.toCollection().first()
      startSync(user.id, b?.id ?? null)
    })()
    return () => { cancelled = true }
  }, [user, business?.id])

  const route = useRoute()

  if (user === undefined || businesses === undefined || checking) return <div className="app"><p className="empty">Loading…</p></div>
  if (!user) return <Login />
  if (!business) return <Onboarding userId={user.id} email={user.email} />

  const [a, b, c] = route
  let screen
  if (a === 'orders' && b && c === 'print') screen = <PrintView id={b} business={business} />
  else if (a === 'orders' && b) screen = <OrderEdit id={b} business={business} />
  else if (a === 'customers' && b) screen = <CustomerDetail id={b} business={business} />
  else if (a === 'customers') screen = <Customers business={business} />
  else if (a === 'money') screen = <Money business={business} />
  else if (a === 'settings') screen = <Settings business={business} user={user} />
  else screen = <Orders business={business} />

  const printing = a === 'orders' && c === 'print'
  return (
    <>
      <div className={printing ? '' : 'app'}>{screen}</div>
      {!printing && <Tabs active={a || 'orders'} />}
    </>
  )
}
