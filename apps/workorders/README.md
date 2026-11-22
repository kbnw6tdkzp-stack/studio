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
- **Work order numbers** are assigned by the database (`supabase/schema.sql`, `assign_work_order_number`):
  one locked counter per business, unique per business, never changed or reused. Orders created
  offline show "Pending #" until they sync.
- **Signatures** store an exact copy of what the customer agreed to plus a SHA-256 fingerprint, and the
  database only allows adding them, never editing or deleting.
- **Your cost** (parts cost, markup) is never put on anything the customer sees (`src/lib/customerDoc.ts`).
- **VIN lookup** uses NHTSA's free vPIC API.

## Supabase

Project: "WO track". Schema: `supabase/schema.sql` (safe to re-run in the SQL editor).
In Authentication → URL Configuration, add the site URL so sign-up and password-reset emails link back to the app.

## Roadmap

1. ~~Accounts, sync, settings, customers, vehicles, VIN lookup, work orders, totals, signatures, money page~~
2. Camera VIN barcode scanning
3. Remote signing link (text the customer a link; they review and sign on their phone)
4. Stripe card payments
5. Face ID (passkeys), PDF attached to texts/emails
6. Other trades (templates per industry)
