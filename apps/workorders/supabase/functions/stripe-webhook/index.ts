// Stripe calls this when a checkout is paid. Verifies Stripe's signature, then records the payment.
// Needs the STRIPE_WEBHOOK_SECRET secret (the "Signing secret" of the webhook endpoint in Stripe).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!WEBHOOK_SECRET) return new Response('webhook secret not set', { status: 500 })
  const payload = await req.text()
  const header = req.headers.get('stripe-signature') ?? ''
  const pairs = header.split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()] })
  const t = pairs.find(([k]) => k === 't')?.[1] ?? ''
  const v1s = pairs.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !v1s.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return new Response('bad signature', { status: 400 })
  const expected = await hmacHex(WEBHOOK_SECRET, `${t}.${payload}`)
  if (!v1s.some((v) => safeEqual(v, expected))) return new Response('bad signature', { status: 400 })

  const event = JSON.parse(payload)
  const s = event?.data?.object
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && s?.payment_status === 'paid') {
    const requestId = s.metadata?.pay_request_id
    if (requestId) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_card_payment`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_request: requestId, p_session: s.id, p_amount_cents: s.amount_total }),
      })
      const out = await res.text()
      console.log('record_card_payment', res.status, out)
      if (!res.ok) return new Response('could not record', { status: 500 }) // Stripe retries
    }
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
})
