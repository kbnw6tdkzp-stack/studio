import { useEffect, useRef, useState } from 'react'
import { extractVin } from '../lib/vin'

type Mod = typeof import('../lib/barcode')

/** Full-screen camera that looks for a VIN barcode. Calls onVin once with a cleaned VIN. */
export function VinScanner({ onVin, onClose }: { onVin: (vin: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState('Starting camera…')
  const [error, setError] = useState('')
  const [torch, setTorch] = useState<null | boolean>(null)
  const track = useRef<MediaStreamTrack | null>(null)
  const mod = useRef<Mod | null>(null)
  const done = useRef(false)

  const finish = (vin: string) => {
    if (done.current) return
    done.current = true
    navigator.vibrate?.(60)
    onVin(vin)
  }

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const lastSeen = { text: '', n: 0 }

    ;(async () => {
      try {
        mod.current = await import('../lib/barcode')
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser can’t open the camera here. Use “Take a photo” instead.')
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return }
        const v = video.current!
        v.srcObject = stream
        await v.play()
        track.current = stream.getVideoTracks()[0] ?? null
        const caps = (track.current?.getCapabilities?.() ?? {}) as { torch?: boolean }
        if (caps.torch) setTorch(false)
        setStatus('Point at the VIN barcode. Door jamb sticker or windshield.')
        const tick = async () => {
          if (stopped || done.current) return
          try {
            if (v.readyState >= 2) {
              for (const text of await mod.current!.readCodes(v)) {
                const vin = extractVin(text)
                if (!vin) { setStatus('That barcode isn’t a VIN. Keep looking.'); continue }
                // Code 39 can misread; take it when it reads the same twice in a row (or has a valid check digit).
                lastSeen.n = lastSeen.text === vin ? lastSeen.n + 1 : 1
                lastSeen.text = vin
                const { checkVin } = await import('../lib/vin')
                const c = checkVin(vin)
                if ((c.ok && c.message === '') || lastSeen.n >= 2) return finish(vin)
              }
            }
          } catch { /* a frame that can't be read; try the next one */ }
          timer = setTimeout(tick, 120)
        }
        void tick()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(/denied|NotAllowed/i.test(msg)
          ? 'Camera access is off. Turn it on in Settings › Safari › Camera (or for this app), or use “Take a photo”.'
          : msg)
        setStatus('')
      }
    })()

    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fromPhoto = async (file: File) => {
    setError(''); setStatus('Reading photo…')
    try {
      mod.current ??= await import('../lib/barcode')
      const bmp = await createImageBitmap(file)
      const texts = await mod.current.readCodes(bmp)
      const vin = texts.map(extractVin).find(Boolean)
      if (vin) return finish(vin)
      setStatus('')
      setError(texts.length ? 'Found a barcode, but it isn’t a VIN.' : 'No barcode found. Get closer, hold steady, and make sure it’s in focus.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const toggleTorch = async () => {
    const next = !torch
    try {
      await track.current?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorch(next)
    } catch { setTorch(null) }
  }

  return (
    <div className="scanner" role="dialog" aria-label="Scan VIN">
      <video ref={video} playsInline muted />
      <div className="scanner-frame" aria-hidden />
      <div className="scanner-top">
        <button className="secondary" onClick={onClose}>Cancel</button>
        {torch !== null && <button className="secondary" onClick={toggleTorch}>{torch ? 'Light off' : 'Light on'}</button>}
      </div>
      <div className="scanner-bottom">
        {status && <p>{status}</p>}
        {error && <p className="scanner-error">{error}</p>}
        <label className="scanner-photo">
          Take a photo instead
          <input type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromPhoto(f); e.target.value = '' }} />
        </label>
      </div>
    </div>
  )
}
