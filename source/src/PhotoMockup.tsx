import { useEffect, useRef, useState } from 'react'
import type { PhotoMock, Place } from './mockups'
import { savePlace } from './mockups'

const cache = new Map<string, Promise<HTMLImageElement>>()
const loadImg = (src: string) => {
  let p = cache.get(src)
  if (!p) { p = new Promise((res, rej) => { const i = new window.Image(); i.onload = () => res(i); i.onerror = rej; i.src = src }); cache.set(src, p) }
  return p
}

// Draw the photo, then the art on top. The art picks up the fabric's light and shadow so it looks printed, not pasted.
async function compose(mock: PhotoMock, place: Place, artUrl: string, aspect: number, maxW: number) {
  const [photo, art] = await Promise.all([loadImg(mock.src), loadImg(artUrl)])
  const k = Math.min(1, maxW / photo.width)
  const w = Math.round(photo.width * k), h = Math.round(photo.height * k)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(photo, 0, 0, w, h)
  const aw = Math.max(4, Math.round(place.width * w)), ah = Math.max(4, Math.round(aw * aspect))
  const x = Math.round(place.cx * w - aw / 2), y = Math.round(place.top * h)
  const t = document.createElement('canvas'); t.width = aw; t.height = ah
  const tx = t.getContext('2d')!
  tx.drawImage(art, 0, 0, aw, ah)
  // average brightness of the fabric under the art, to lift it towards mid-grey for the texture pass
  const s = document.createElement('canvas'); s.width = 12; s.height = 12
  const sx = s.getContext('2d')!
  sx.drawImage(photo, x / k, y / k, aw / k, ah / k, 0, 0, 12, 12)
  const d = sx.getImageData(0, 0, 12, 12).data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3
  const mean = Math.max(8, sum / (d.length / 4))
  const lift = Math.min(6, Math.max(1, 128 / mean))
  const tex = document.createElement('canvas'); tex.width = aw; tex.height = ah
  const tc = tex.getContext('2d')!
  tc.filter = `brightness(${lift})`
  tc.drawImage(photo, x / k, y / k, aw / k, ah / k, 0, 0, aw, ah)
  tx.globalCompositeOperation = 'soft-light'
  tx.globalAlpha = 0.45
  tx.drawImage(tex, 0, 0)
  tx.globalAlpha = 1
  tx.globalCompositeOperation = 'destination-in'
  tx.drawImage(art, 0, 0, aw, ah)
  ctx.globalAlpha = 0.96
  ctx.drawImage(t, x, y)
  return c
}

export default function PhotoMockup({ mock, art, aspect, filename, onDelete }: { mock: PhotoMock; art: string | null; aspect: number; filename: string; onDelete?: () => void }) {
  const [place, setPlace] = useState<Place>(mock.place)
  const view = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; cx: number; top: number } | null>(null)

  useEffect(() => { setPlace(mock.place) }, [mock.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true
    if (!art || !view.current) return
    compose(mock, place, art, aspect, 640).then((c) => {
      const v = view.current
      if (!live || !v) return
      v.width = c.width; v.height = c.height
      v.getContext('2d')!.drawImage(c, 0, 0)
    })
    return () => { live = false }
  }, [mock, place, art, aspect])

  const update = (p: Place, persist = false) => { setPlace(p); if (persist) savePlace(mock, p) }

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, cx: place.cx, top: place.top }
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current, v = view.current
    if (!d || !v) return
    const r = v.getBoundingClientRect()
    update({ ...place, cx: d.cx + (e.clientX - d.x) / r.width, top: d.top + (e.clientY - d.y) / r.height })
  }
  const up = () => { if (drag.current) { drag.current = null; savePlace(mock, place) } }

  const download = async () => {
    if (!art) return
    const c = await compose(mock, place, art, aspect, 2048)
    const a = document.createElement('a'); a.href = c.toDataURL('image/jpeg', 0.92); a.download = `${filename}-${mock.id}.jpg`; a.click()
  }

  return (
    <>
      <canvas ref={view} className="photo-preview" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <p className="muted small">Drag the art to move it. The slider changes its size.</p>
      <label>Art size
        <input type="range" min={0.08} max={0.7} step={0.005} value={place.width} onChange={(e) => update({ ...place, width: +e.target.value })} onPointerUp={() => savePlace(mock, place)} onKeyUp={() => savePlace(mock, place)} />
      </label>
      <div className="row">
        <button onClick={() => update(mock.place, true)}>Reset</button>
        <button className="primary" onClick={download} disabled={!art}>Download</button>
      </div>
      {onDelete && <button className="ghost danger" onClick={onDelete}>Remove this photo</button>}
    </>
  )
}
