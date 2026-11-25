import { useEffect, useState } from 'react'
import type { CustomerDoc } from '../lib/customerDoc'
import type { PdfSig } from '../lib/pdf'

/**
 * Makes the PDF as soon as the page shows, so the tap only has to hand it over.
 * iPhones only allow sharing a file right after a tap, so it can't be built on tap.
 */
export function PdfButton({ doc, title, status, logo, terms, sigs, label = 'Download PDF', className }: {
  doc: CustomerDoc; title: string; status?: string; logo?: string | null; terms: string[]; sigs: PdfSig[]; label?: string; className?: string
}) {
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState('')
  const key = JSON.stringify([doc, title, status, terms, sigs.map((s) => s.hash)])

  useEffect(() => {
    let live = true
    setFile(null); setErr('')
    import('../lib/pdf')
      .then(async ({ buildPdf, pdfName }) => {
        const blob = await buildPdf(doc, { title, status, logo, terms, sigs })
        if (live) setFile(new File([blob], pdfName(doc, title), { type: 'application/pdf' }))
      })
      .catch(() => { if (live) setErr('Couldn’t make the PDF. Check your connection and reload.') })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, logo])

  const save = async () => {
    if (!file) return
    // Phones: the share sheet has "Save to Files", Mail, Messages…
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); return }
      catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    // Computers, or if sharing isn't available: a normal download, or open it to save from the viewer.
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url; a.download = file.name; a.rel = 'noopener'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <>
      <button className={className} disabled={!file} onClick={save}>{file ? label : err ? 'PDF unavailable' : 'Preparing PDF…'}</button>
      {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
    </>
  )
}
