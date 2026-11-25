import { db } from '../lib/db'
import { useLive, go } from '../lib/hooks'
import { customerDoc, KIND_LABEL } from '../lib/customerDoc'
import { STATUS } from '../lib/format'
import { logoUrl } from '../lib/logo'
import { Empty } from '../components/ui'
import { DocView } from '../components/DocView'
import { PdfButton } from '../components/PdfButton'
import type { Business } from '../lib/types'

export default function PrintView({ id, business }: { id: string; business: Business }) {
  const data = useLive(async () => {
    const w = await db.work_orders.get(id)
    if (!w) return null
    return {
      w,
      c: w.customer_id ? await db.customers.get(w.customer_id) : undefined,
      v: w.vehicle_id ? await db.vehicles.get(w.vehicle_id) : undefined,
      sigs: (await db.signatures.where('work_order_id').equals(id).toArray()).sort((a, b) => a.signed_at.localeCompare(b.signed_at)),
    }
  }, [id])
  if (data === undefined) return <Empty>Loading…</Empty>
  if (!data) return <Empty>Work order not found.</Empty>
  const { w, c, v, sigs: sigRows } = data
  const isInvoice = ['completed', 'paid'].includes(w.status)
  const doc = customerDoc(w, business, c, v)
  const logo = logoUrl(business.logo_path)
  const title = isInvoice ? 'Invoice' : 'Work order / Estimate'
  const terms = [w.data.terms.diagnosis, w.data.terms.repair, w.data.terms.general]
  const sigs = sigRows.map((s) => ({ label: KIND_LABEL[s.kind], amount: (s.snapshot as { amount?: number })?.amount ?? null, signer_name: s.signer_name,
    signed_at: s.signed_at, image: s.image, hash: s.snapshot_hash, remote: s.method === 'remote' }))
  return (
    <div className="doc-wrap">
      <div className="doc-actions no-print">
        <button className="secondary" onClick={() => go(`/orders/${id}`)}>‹ Back</button>
        <div className="row">
          <button className="secondary" onClick={() => window.print()}>Print</button>
          <PdfButton doc={doc} logo={logo} title={title} status={STATUS[w.status].label} terms={terms} sigs={sigs} label="PDF" />
        </div>
      </div>
      <DocView doc={doc} logo={logo} title={title} status={STATUS[w.status].label} terms={terms} sigs={sigs} />
    </div>
  )
}
