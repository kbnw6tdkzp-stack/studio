# Work Orders

Work orders, estimates, signatures and invoices for mobile mechanics. Installable on iPhone/iPad
(Share → Add to Home Screen), works offline, and syncs through Supabase to every device you sign in on.

The built app is served from `/wo/` on the studio GitHub Pages site.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # totals math and VIN checks
npm run build    # builds into ../../wo
```

## How it fits together

- **Offline first.** Everything is saved on the device (IndexedDB via Dexie) and queued in an outbox.
  `src/lib/sync.ts` uploads the queue and downloads changes whenever there's a connection.
- **Work order numbers** are assigned by the database (`supabase/migrations/`, `assign_work_order_number`):
  one locked counter per business, unique per business, never changed or reused. Orders created
  offline show "Pending #" until they sync.
- **Signatures** store an exact copy of what the customer agreed to plus a SHA-256 fingerprint, and the
  database only allows adding them, never editing or deleting.
- **Your cost** (parts cost, markup) is never put on anything the customer sees (`src/lib/customerDoc.ts`).
- **VIN lookup** uses NHTSA's free vPIC API. Camera scanning uses zxing (bundled, works offline).
- **Signing links** (`#/sign/<token>`) need no account. Only a SHA-256 of the token is stored; the database
  builds the signed record itself (time, IP, device, exact document) so it can't be altered from the phone.

## Supabase

Project: "WO track". Schema: `supabase/migrations/` (safe to re-run in the SQL editor).
In Authentication → URL Configuration, add the site URL so sign-up and password-reset emails link back to the app.

## Stripe setup (card payments)

Code: `supabase/functions/pay-checkout` (starts Stripe Checkout) and `supabase/functions/stripe-webhook`
(Stripe confirms the payment; the database records it). Both are deployed to the "WO track" project.

1. Stripe dashboard → Developers → API keys: copy the **Secret key** (`sk_test_…` while testing).
2. Supabase → WO track → Edge Functions → Secrets: add `STRIPE_SECRET_KEY` with that value.
3. Stripe → Developers → Webhooks → Add endpoint:
   `https://jvkkjwwsazrzqgfwomiw.supabase.co/functions/v1/stripe-webhook`,
   events `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
4. Copy that endpoint's **Signing secret** (`whsec_…`) into Supabase secrets as `STRIPE_WEBHOOK_SECRET`.
5. In the app, Settings → Card payments should say "Connected · test mode". Test with card 4242 4242 4242 4242.
6. When ready for real money, repeat steps 1–4 with live mode keys.

## Roadmap

1. ~~Accounts, sync, settings, customers, vehicles, VIN lookup, work orders, totals, signatures, money page~~
2. ~~Camera VIN barcode scanning~~
3. ~~Remote signing link (text the customer a link; they review and sign on their phone)~~
4. ~~Stripe card payments (pay link + QR code, optional card fee)~~
5. Face ID (passkeys), PDF attached to texts/emails
6. Other trades (templates per industry)
