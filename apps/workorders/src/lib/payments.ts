import { supabase } from './supabase'
import { db, getMeta, setMeta } from './db'
import { flushSync } from './sync'
import { sha256 } from './repo'
import { uid, withDefaults } from './defaults'
import { customerDoc } from './customerDoc'
import { totals } from './money'
import { logoUrl } from './logo'
import type { Business, Customer, PayRequest, RemoteDocument, Vehicle, WorkOrder } from './types'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const newToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const appUrl = () => location.origin + location.pathname

export const cardFee = (balance: number, b: Business) => {
  const s = withDefaults(b.settings)
  return s.cardFeeEnabled && s.cardFeePct > 0 ? r2((balance * s.cardFeePct) / 100) : 0
}

/** A link (and QR code) the customer uses to pay the balance by card. Needs a connection. */
export async function createPayRequest(w: WorkOrder, b: Business, c?: Customer | null, v?: Vehicle | null) {
  if (!navigator.onLine) throw new Error('You need signal to make a pay link. You can record a cash or other payment instead.')
  await flushSync()
  const saved = (await db.work_orders.get(w.id)) ?? w
  const balance = totals(saved.data).balance
  if (balance <= 0) throw new Error('Nothing is owed on this work order.')
  const s = withDefaults(b.settings)
  const doc = customerDoc(saved, b, c, v)
  const document: RemoteDocument = { label: 'Invoice', terms: [], amount: balance, logo: logoUrl(b.logo_path), doc }
  const token = newToken()
  const fee = cardFee(balance, b)
  const row = {
    id: uid(), business_id: b.id, work_order_id: w.id, token_hash: await sha256(token), document,
    amount: balance, card_fee: fee, card_fee_pct: fee > 0 ? s.cardFeePct : 0, return_url: appUrl(), status: 'pending' as const,
  }
  const { data, error } = await supabase.from('pay_requests').insert(row).select().single()
  if (error) throw new Error(error.message)
  await db.pay_requests.put(data as PayRequest)
  const url = `${appUrl()}#/pay/${token}`
  await setMeta(`paylink:${row.id}`, url)
  return { request: data as PayRequest, url }
}

export const payLinkFor = (id: string) => getMeta<string>(`paylink:${id}`)

export async function cancelPayRequest(r: PayRequest) {
  const { data, error } = await supabase.from('pay_requests').update({ status: 'cancelled' }).eq('id', r.id).select().single()
  if (error) throw new Error(navigator.onLine ? error.message : 'You need signal to cancel a link.')
  await db.pay_requests.put(data as PayRequest)
}

export async function stripeStatus(): Promise<{ configured: boolean; mode: 'test' | 'live' | null } | null> {
  const { data, error } = await supabase.functions.invoke('pay-checkout', { body: { action: 'status' } })
  return error ? null : data
}

/** Customer side: get a Stripe checkout page for this pay link. */
export async function startCheckout(token: string): Promise<{ url?: string; error?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke('pay-checkout', { body: { token } })
  if (error) return { error: 'network' }
  return data
}
