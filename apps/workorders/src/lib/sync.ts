import { supabase } from './supabase'
import { db, getMeta, setMeta, type SyncTable } from './db'
import { totals } from './money'
import type { WorkOrder } from './types'

// Order matters: a vehicle needs its customer on the server first, and so on.
const ORDER: SyncTable[] = ['businesses', 'profiles', 'customers', 'vehicles', 'work_orders', 'sign_requests', 'signatures', 'pay_requests', 'card_payments']
const KEY: Record<SyncTable, string> = {
  businesses: 'id', profiles: 'user_id', customers: 'id', vehicles: 'id', work_orders: 'id', sign_requests: 'id', signatures: 'id', pay_requests: 'id', card_payments: 'id',
}
// Fields the server controls. Never sent up.
const SERVER_ONLY: Partial<Record<SyncTable, string[]>> = {
  work_orders: ['number', 'updated_at'],
  businesses: ['updated_at'], profiles: ['updated_at'], customers: ['updated_at'], vehicles: ['updated_at'],
}

type Listener = (s: SyncState) => void
export interface SyncState { online: boolean; syncing: boolean; pending: number; lastSync: string | null; error: string | null }
let state: SyncState = { online: navigator.onLine, syncing: false, pending: 0, lastSync: null, error: null }
const listeners = new Set<Listener>()
const emit = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l(state)) }
export const subscribeSync = (l: Listener) => { listeners.add(l); l(state); return () => { listeners.delete(l) } }

export async function queue(table: SyncTable, key: string) {
  await db.outbox.add({ table, key })
  emit({ pending: await db.outbox.count() })
  scheduleSync()
}

async function push() {
  const items = await db.outbox.orderBy('seq').toArray()
  if (!items.length) return
  const maxSeq = items[items.length - 1].seq!
  for (const table of ORDER) {
    const keys = [...new Set(items.filter((i) => i.table === table).map((i) => i.key))]
    if (!keys.length) continue
    const rows = (await (db[table] as any).bulkGet(keys)).filter(Boolean)
    const payload = rows.map((r: Record<string, unknown>) => {
      const out = { ...r }
      for (const f of SERVER_ONLY[table] ?? []) delete out[f]
      return out
    })
    for (let i = 0; i < payload.length; i += 200) {
      const chunk = payload.slice(i, i + 200)
      const q = table === 'signatures'
        ? supabase.from(table).upsert(chunk, { onConflict: 'id', ignoreDuplicates: true }).select()
        : supabase.from(table).upsert(chunk, { onConflict: KEY[table] }).select()
      const { data, error } = await q
      if (error) throw new Error(`${table}: ${error.message}`)
      // Bring back what the server set (work order numbers, timestamps), except for
      // records you've changed again on this device since this upload started.
      if (data?.length) {
        const newer = new Set((await db.outbox.where('seq').above(maxSeq).toArray()).filter((i) => i.table === table).map((i) => i.key))
        await (db[table] as any).bulkPut(data.filter((r: Record<string, string>) => !newer.has(r[KEY[table]])))
      }
    }
  }
  await db.outbox.where('seq').belowOrEqual(maxSeq).delete()
}

async function pull(businessId: string | null) {
  const pendingKeys = new Set((await db.outbox.toArray()).map((i) => `${i.table}:${i.key}`))
  for (const table of ORDER) {
    if (table === 'profiles' || table === 'businesses') continue
    if (!businessId) return
    const col = table === 'signatures' || table === 'card_payments' ? 'created_at' : 'updated_at'
    const since = (await getMeta<string>(`pulled:${table}`)) ?? '1970-01-01T00:00:00Z'
    let cursor = since
    for (;;) {
      const { data, error } = await supabase.from(table).select('*')
        .eq('business_id', businessId).gt(col, cursor).order(col).limit(1000)
      if (error) throw new Error(`${table}: ${error.message}`)
      if (!data?.length) break
      // Don't overwrite something you changed on this device that hasn't gone up yet.
      const fresh = data.filter((r) => !pendingKeys.has(`${table}:${r[KEY[table]]}`))
      await (db[table] as any).bulkPut(fresh)
      cursor = data[data.length - 1][col]
      await setMeta(`pulled:${table}`, cursor)
      if (data.length < 1000) break
    }
  }
}

/** Pull this user's business and profile. Returns the business id, or null if they haven't set one up. */
export async function pullAccount(userId: string): Promise<string | null> {
  const [{ data: biz, error: e1 }, { data: prof, error: e2 }] = await Promise.all([
    supabase.from('businesses').select('*').is('deleted_at', null).order('updated_at', { ascending: false }),
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const pendingKeys = new Set((await db.outbox.toArray()).map((i) => `${i.table}:${i.key}`))
  if (biz?.length) await db.businesses.bulkPut(biz.filter((b) => !pendingKeys.has(`businesses:${b.id}`)))
  if (prof && !pendingKeys.has(`profiles:${userId}`)) await db.profiles.put(prof)
  const local = await db.businesses.toArray()
  return (biz?.[0]?.id as string | undefined) ?? local[0]?.id ?? null
}

let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null
let again = false
let currentBusiness: string | null = null
let currentUser: string | null = null

export function startSync(userId: string, businessId: string | null) {
  currentUser = userId
  currentBusiness = businessId
  scheduleSync(0)
}
export function stopSync() { currentUser = null; currentBusiness = null }

export function scheduleSync(delay = 800) {
  clearTimeout(timer)
  timer = setTimeout(() => { void syncNow() }, delay)
}

export async function syncNow() {
  if (!currentUser || !navigator.onLine) { emit({ online: navigator.onLine }); return }
  // A save that lands while a sync is running must not be dropped: run again right after.
  if (running) { again = true; return running }
  again = false
  running = (async () => {
    emit({ syncing: true, error: null, online: true })
    try {
      await push()
      if (!currentBusiness) currentBusiness = await pullAccount(currentUser!)
      else await pullAccount(currentUser!)
      await pull(currentBusiness)
      if (await reconcileCardPayments()) await push()
      emit({ lastSync: new Date().toISOString() })
    } catch (e) {
      emit({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      emit({ syncing: false, pending: await db.outbox.count() })
      running = null
      if (again && !state.error) scheduleSync(0)
    }
  })()
  return running
}

window.addEventListener('online', () => { emit({ online: true }); scheduleSync(0) })
window.addEventListener('offline', () => emit({ online: false }))
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(0) })
setInterval(() => scheduleSync(0), 60_000)

/** Upload everything waiting on this device, waiting out a sync that's already running. */
export async function flushSync(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    if (running) await running
    await syncNow()
    if (state.error) throw new Error(state.error)
    if (!(await db.outbox.count())) return
  }
}

/**
 * Card payments are recorded by the server when Stripe confirms them. If a device ever sends up an
 * older copy of the work order without that payment, put it back. Same ids as the server uses, so
 * nothing is ever counted twice.
 */
async function reconcileCardPayments(): Promise<boolean> {
  const pays = await db.card_payments.toArray()
  let changed = false
  for (const p of pays) {
    const w = await db.work_orders.get(p.work_order_id)
    if (!w || w.data.payments.some((x) => x.id === p.id)) continue
    const fees = Number(p.fee) > 0 && !w.data.fees.some((f) => f.id === `fee-${p.id}`)
      ? [...w.data.fees, { id: `fee-${p.id}`, name: `Card processing fee (${Number(p.fee_pct)}%)`, amount: Number(p.fee), taxable: false, card: true }]
      : w.data.fees
    const data = { ...w.data, fees, payments: [...w.data.payments, { id: p.id, amount: Number(p.amount), method: 'Card (Stripe)', date: p.created_at, note: 'Paid online' }] }
    const t = totals(data)
    const paid = t.balance <= 0.005 && w.status !== 'void'
    const row: WorkOrder = {
      ...w, data, subtotal: t.subtotal, tax: t.tax, total: t.total, amount_paid: t.paid, parts_cost: t.partsCost,
      status: paid ? 'paid' : w.status, paid_at: paid ? (w.paid_at ?? p.created_at) : w.paid_at, updated_at: new Date().toISOString(),
    }
    await db.work_orders.put(row)
    await db.outbox.add({ table: 'work_orders', key: w.id })
    changed = true
  }
  return changed
}
