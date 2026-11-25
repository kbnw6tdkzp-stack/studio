import { useEffect, useRef, useState } from 'react'
import SignaturePadLib from 'signature_pad'

/** Finger/stylus signature box. Calls onChange with a PNG data URL, or null when cleared. */
export function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pad = useRef<SignaturePadLib | null>(null)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = canvas.current!
    const p = new SignaturePadLib(c, { penColor: '#111', backgroundColor: 'rgba(255,255,255,0)', minWidth: 0.8, maxWidth: 2.6 })
    pad.current = p
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const data = p.toData()
      c.width = c.offsetWidth * ratio
      c.height = c.offsetHeight * ratio
      c.getContext('2d')!.scale(ratio, ratio)
      p.clear()
      p.fromData(data)
    }
    resize()
    const end = () => { setEmpty(p.isEmpty()); onChange(p.isEmpty() ? null : p.toDataURL('image/png')) }
    p.addEventListener('endStroke', end)
    window.addEventListener('resize', resize)
    return () => { p.removeEventListener('endStroke', end); window.removeEventListener('resize', resize); p.off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="sigpad">
      <canvas ref={canvas} aria-label="Sign here" />
      <div className="sigpad-line"><span>✕</span>{empty && <em>Sign here with your finger</em>}</div>
      <button type="button" className="ghost small" onClick={() => { pad.current?.clear(); setEmpty(true); onChange(null) }}>Clear</button>
    </div>
  )
}
