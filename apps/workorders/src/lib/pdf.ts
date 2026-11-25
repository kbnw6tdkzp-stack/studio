// Builds a real PDF file of a customer document (work order, estimate, invoice, receipt).
// Used instead of the browser's print, which iPhones block in some places (e.g. links
// opened inside Messages).
import { jsPDF } from 'jspdf'
import { money } from './money'
import type { CustomerDoc } from './customerDoc'

export interface PdfSig { label: string; amount: number | null; signer_name: string; signed_at: string; image: string; hash: string; remote?: boolean }

async function toDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bmp.width; c.height = bmp.height
    c.getContext('2d')!.drawImage(bmp, 0, 0)
    return { data: c.toDataURL('image/png'), w: bmp.width, h: bmp.height }
  } catch { return null }
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

export async function buildPdf(doc: CustomerDoc, opts: { title: string; status?: string; logo?: string | null; terms: string[]; sigs: PdfSig[] }): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 48
  let y = M
  const need = (h: number) => { if (y + h > H - M) { pdf.addPage(); y = M } }
  const text = (s: string, x: number, size = 10, style: 'normal' | 'bold' = 'normal', color = 20, align: 'left' | 'right' = 'left', width = W - 2 * M) => {
    pdf.setFont('helvetica', style); pdf.setFontSize(size); pdf.setTextColor(color)
    const lines = pdf.splitTextToSize(s || '', width) as string[]
    const lh = size * 1.3
    for (const l of lines) { need(lh); pdf.text(l, x, y + size, { align }); y += lh }
  }
  const rule = (weight = 0.5, color = 200) => { need(8); pdf.setDrawColor(color); pdf.setLineWidth(weight); pdf.line(M, y + 4, W - M, y + 4); y += 10 }
  const heading = (s: string) => { y += 8; text(s.toUpperCase(), M, 8, 'bold', 110) }

  // Header: business on the left, document title and number on the right.
  const top = y
  let left = M
  if (opts.logo) {
    const img = await toDataUrl(opts.logo)
    if (img) {
      const s = Math.min(56 / img.w, 56 / img.h)
      pdf.addImage(img.data, 'PNG', M, y, img.w * s, img.h * s)
      left = M + img.w * s + 12
    }
  }
  const b = doc.business
  text(b.name, left, 16, 'bold', 20, 'left', 300)
  if (b.legal_name) text(b.legal_name, left, 10, 'normal', 40, 'left', 300)
  const contact = [b.address, b.phone, b.email].filter(Boolean).join(' · ')
  if (contact) text(contact, left, 9, 'normal', 90, 'left', 300)
  if (b.license) text(`License ${b.license}`, left, 9, 'normal', 90, 'left', 300)
  const leftEnd = Math.max(y, top + 56)
  y = top
  text(opts.title.toUpperCase(), W - M, 10, 'bold', 90, 'right', 200)
  text(doc.workOrder.number, W - M, 18, 'bold', 20, 'right', 200)
  text(new Date(doc.workOrder.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' }), W - M, 9, 'normal', 90, 'right', 200)
  if (opts.status) text(opts.status, W - M, 9, 'normal', 90, 'right', 200)
  y = Math.max(y, leftEnd) + 6
  rule(1.5, 20)

  // Customer and vehicle side by side.
  const colTop = y
  heading('Customer')
  text(doc.customer.name, M, 10, 'bold', 20, 'left', 240)
  for (const l of [[doc.customer.phone, doc.customer.email].filter(Boolean).join(' · '), doc.customer.address]) if (l) text(l, M, 9, 'normal', 90, 'left', 240)
  const colEnd = y
  if (doc.vehicle) {
    y = colTop
    const x = W / 2 + 10
    y += 8; text('VEHICLE', x, 8, 'bold', 110, 'left', 240)
    text(doc.vehicle.description, x, 10, 'bold', 20, 'left', 240)
    const v = [doc.vehicle.engine, doc.vehicle.plate && `Plate ${doc.vehicle.plate}`, doc.vehicle.mileage && `${doc.vehicle.mileage} mi`].filter(Boolean).join(' · ')
    if (v) text(v, x, 9, 'normal', 90, 'left', 240)
    if (doc.vehicle.vin) text(`VIN ${doc.vehicle.vin}`, x, 9, 'normal', 90, 'left', 240)
  }
  y = Math.max(y, colEnd) + 4

  if (doc.complaint) { heading('Customer concern'); text(doc.complaint, M) }
  if (doc.findings) { heading('Findings'); text(doc.findings, M) }

  // Line items. Only what the customer sees: never your cost.
  y += 10
  const amtX = W - M
  const row = (label: string, amount: string, sub?: string, bold = false) => {
    need(16)
    const start = y
    text(label, M, 10, bold ? 'bold' : 'normal', 20, 'left', W - 2 * M - 110)
    const after = y
    y = start; text(amount, amtX, 10, bold ? 'bold' : 'normal', 20, 'right', 110)
    y = after
    if (sub) text(sub, M, 8.5, 'normal', 100, 'left', W - 2 * M - 110)
    y += 3
  }
  text('DESCRIPTION', M, 8, 'bold', 110); y -= 10.4; text('AMOUNT', amtX, 8, 'bold', 110, 'right', 110)
  rule()
  if (doc.diagnosis.amount > 0) row(`Diagnosis (${doc.diagnosis.hours} hr)`, money(doc.diagnosis.amount))
  for (const j of doc.jobs) {
    const sub = [j.notes, doc.itemized && j.parts != null ? `Parts ${money(j.parts)} · Labor ${money(j.labor ?? 0)}` : '', j.partList?.join(', ')].filter(Boolean).join('\n')
    row(j.title || 'Repair', money(j.total), sub || undefined, true)
  }
  if (doc.diagnosis.credit > 0) row('Diagnosis credit', `−${money(doc.diagnosis.credit)}`)
  for (const f of doc.fees) row(f.name, money(f.amount))
  rule()

  // Totals on the right.
  const tot = (label: string, amount: string, bold = false, size = 10) => {
    need(size * 1.4)
    const s = y
    text(label, W - M - 220, size, bold ? 'bold' : 'normal', 20, 'left', 120); y = s
    text(amount, amtX, size, bold ? 'bold' : 'normal', 20, 'right', 110)
  }
  if (doc.itemized) { tot('Parts', money(doc.totals.parts ?? 0)); tot('Labor', money(doc.totals.labor ?? 0)) }
  tot('Subtotal', money(doc.totals.subtotal))
  tot(`Tax (${doc.tax.rate}%)`, money(doc.tax.amount))
  tot('Total', money(doc.totals.total), true, 13)
  if (doc.totals.paid > 0) { tot('Paid', `−${money(doc.totals.paid)}`); tot('Balance due', money(doc.totals.balance), true) }

  const terms = opts.terms.filter(Boolean)
  if (terms.length) { y += 6; heading('Terms'); for (const t of terms) { text(t, M, 8.5, 'normal', 70); y += 4 } }

  for (const s of opts.sigs) {
    need(110)
    y += 10
    rule(0.5, 150)
    try { pdf.addImage(s.image, 'PNG', M, y, 180, 60) } catch { /* unreadable signature image */ }
    y += 62
    text(`${s.label}${s.amount != null ? ` · ${money(s.amount)}` : ''}`, M, 10, 'bold')
    text(`${s.signer_name} · ${when(s.signed_at)}${s.remote ? ' · signed online' : ''}`, M, 9, 'normal', 90)
    text(`Record #${s.hash.slice(0, 16)}`, M, 8, 'normal', 120)
  }

  // Footer on every page.
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(140)
    pdf.text(`${doc.workOrder.number} · ${b.name} · page ${i} of ${pages}`, W / 2, H - 24, { align: 'center' })
  }
  return pdf.output('blob')
}

export const pdfName = (doc: CustomerDoc, title: string) =>
  `${doc.workOrder.number} ${title}`.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.pdf'
