// Starts a Stripe Checkout for a pay link. Public: the customer's pay page calls it with the link token.
// Needs the STRIPE_SECRET_KEY secret (Supabase dashboard → Edge Functions → Secrets).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const body = await req.json().catch(() => ({}))

  // Lets the app's Settings show whether Stripe is connected, and in which mode. Never returns the key.
  if (body.action === 'status') {
    return json({ configured: !!STRIPE_KEY, mode: !STRIPE_KEY ? null : /^(sk|rk)_live_/.test(STRIPE_KEY) ? 'live' : 'test' })
  }
  if (!STRIPE_KEY) return json({ error: 'not_configured' })
  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) return json({ error: 'not_found' })

  const res = await fetch(`${SUPABASE_URL}/rest/v1/pay_requests?select=*&token_hash=eq.${await sha256(token)}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  const rows = await res.json()
  const r = Array.isArray(rows) ? rows[0] : null
  if (!r) return json({ error: 'not_found' })
  if (r.status === 'paid') return json({ error: 'paid' })
  if (r.status !== 'pending') return json({ error: r.status })
  if (new Date(r.expires_at) < new Date()) return json({ error: 'expired' })

  const doc = r.document?.doc ?? {}
  const business = doc.business?.legal_name || doc.business?.name || 'Repair'
  const number = doc.workOrder?.number ?? ''
  const back = `${r.return_url}#/pay/${token}`
  const f = new URLSearchParams()
  f.set('mode', 'payment')
  f.set('success_url', `${back}/done`)
  f.set('cancel_url', back)
  f.set('allowed_payment_method_types[0]', 'card') // card fee applies to cards; Apple Pay / Google Pay are cards
  f.set('line_items[0][quantity]', '1')
  f.set('line_items[0][price_data][currency]', 'usd')
  f.set('line_items[0][price_data][unit_amount]', String(Math.round(Number(r.amount) * 100)))
  f.set('line_items[0][price_data][product_data][name]', `${number} – ${business}`.slice(0, 250))
  const desc = doc.vehicle?.description ? `${doc.vehicle.description}` : ''
  if (desc) f.set('line_items[0][price_data][product_data][description]', desc.slice(0, 250))
  if (Number(r.card_fee) > 0) {
    f.set('line_items[1][quantity]', '1')
    f.set('line_items[1][price_data][currency]', 'usd')
    f.set('line_items[1][price_data][unit_amount]', String(Math.round(Number(r.card_fee) * 100)))
    f.set('line_items[1][price_data][product_data][name]', `Card processing fee (${r.card_fee_pct}%)`)
  }
  f.set('metadata[pay_request_id]', r.id)
  f.set('metadata[work_order]', number)
  f.set('payment_intent_data[metadata][pay_request_id]', r.id)
  f.set('payment_intent_data[description]', `${number} – ${business}`.slice(0, 250))
  if (doc.customer?.email) f.set('customer_email', doc.customer.email)
  f.set('expires_at', String(Math.floor(Date.now() / 1000) + 60 * 60))

  const s = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: f,
  })
  const session = await s.json()
  if (!s.ok) {
    console.error('stripe', session?.error?.message)
    return json({ error: 'stripe', message: session?.error?.message ?? 'Stripe error' })
  }
  return json({ url: session.url })
})
