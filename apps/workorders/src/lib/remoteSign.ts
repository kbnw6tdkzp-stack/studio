import { supabase } from './supabase'
import { db, getMeta, setMeta } from './db'
import { flushSync } from './sync'
import { sha256 } from './repo'
import { uid } from './defaults'
import { customerDoc, KIND_LABEL, termsFor } from './customerDoc'
import { logoUrl } from './logo'
import type { Business, Customer, RemoteDocument, SignatureKind, SignRequest, Vehicle, WorkOrder } from './types'

const newToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const appUrl = () => location.origin + location.pathname

/** Create a link the customer can open on their phone to review and sign. Needs a connection. */
export async function createSignRequest(kind: SignatureKind, w: WorkOrder, b: Business, c?: Customer | null, v?: Vehicle | null) {
  if (!navigator.onLine) throw new Error('You need signal to create a signing link. You can still have them sign on your screen.')
  // The work order has to be on the server before the link can point at it.
  await flushSync()
  const stillPending = await db.outbox.filter((i) => i.table === 'work_orders' && i.key === w.id).count()
  if (stillPending) throw new Error('This work order hasn’t finished uploading yet. Try again in a moment.')
  const saved = (await db.work_orders.get(w.id)) ?? w
  const doc = customerDoc(saved, b, c, v)
  const document: RemoteDocument = {
    label: KIND_LABEL[kind], terms: termsFor(kind, saved),
    amount: kind === 'diagnosis' ? doc.diagnosis.amount : doc.totals.total,
    logo: logoUrl(b.logo_path), doc,
  }
  const token = newToken()
  const row = {
    id: uid(), business_id: b.id, work_order_id: w.id, kind, token_hash: await sha256(token), document, status: 'pending' as const,
  }
  const { data, error } = await supabase.from('sign_requests').insert(row).select().single()
  if (error) throw new Error(error.message)
  await db.sign_requests.put(data as SignRequest)
  const url = `${appUrl()}#/sign/${token}`
  await setMeta(`signlink:${row.id}`, url)
  return { request: data as SignRequest, url }
}

/** The link is only known on the device that made it (the server keeps just a fingerprint). */
export const linkFor = (id: string) => getMeta<string>(`signlink:${id}`)

export async function cancelSignRequest(r: SignRequest) {
  const { data, error } = await supabase.from('sign_requests').update({ status: 'cancelled' }).eq('id', r.id).select().single()
  if (error) throw new Error(navigator.onLine ? error.message : 'You need signal to cancel a link.')
  await db.sign_requests.put(data as SignRequest)
}

export function shareText(b: Business, kind: SignatureKind, amountText: string, url: string) {
  const what = kind === 'diagnosis' ? `authorize the ${amountText} diagnosis` : kind === 'repair' ? `review and approve the repair estimate (${amountText})` : 'confirm the work was completed'
  return `${b.name || 'Your mechanic'}: please ${what} here: ${url}`
}
