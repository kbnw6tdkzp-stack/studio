import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { jsPDF } from 'jspdf'
import Canvas from './Canvas'
import Thumb from './Thumb'
import { useStore, uid } from './store'
import { saveDesign } from './storage'
import { TEMPLATES, PRESETS, buildDesign } from './templates'
import PhotoMockup from './PhotoMockup'
import { BUILTIN_MOCKS, listUserMocks, saveUserMock, deleteUserMock, loadPlace, type PhotoMock } from './mockups'
import type { El, ShapeEl, TextEl } from './types'

type Tab = 'design' | 'elements' | 'text' | 'brand' | 'uploads' | 'mockup'
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'design', icon: '▦', label: 'Design' },
  { id: 'elements', icon: '◇', label: 'Elements' },
  { id: 'text', icon: 'T', label: 'Text' },
  { id: 'brand', icon: '❦', label: 'Brand' },
  { id: 'uploads', icon: '⇪', label: 'Uploads' },
  { id: 'mockup', icon: '👕', label: 'Mockup' },
]

// Comfort Colors 1717 colours (approximate shades, matched by eye; edit the hex values to match your colour chart exactly)
const SHIRTS = [
  { name: 'White', hex: '#f4f4f1' }, { name: 'Ivory', hex: '#efe8d2' }, { name: 'Butter', hex: '#f2e29a' }, { name: 'Banana', hex: '#f3dc6b' },
  { name: 'Mustard', hex: '#d49a2c' }, { name: 'Yam', hex: '#c66a33' }, { name: 'Terracotta', hex: '#c0765a' }, { name: 'Paprika', hex: '#b04a2f' },
  { name: 'Crimson', hex: '#9a2b3c' }, { name: 'Brick', hex: '#8a3f35' }, { name: 'Berry', hex: '#8a3a5c' }, { name: 'Blossom', hex: '#efc2cc' },
  { name: 'Orchid', hex: '#c8a3c0' }, { name: 'Violet', hex: '#8d7ea9' }, { name: 'Chalky Mint', hex: '#a9d3c3' }, { name: 'Seafoam', hex: '#a3c8b4' },
  { name: 'Sage', hex: '#a2ad8a' }, { name: 'Moss', hex: '#6e744a' }, { name: 'Island Green', hex: '#3f8f73' }, { name: 'Blue Spruce', hex: '#5a7b78' },
  { name: 'Ice Blue', hex: '#a9c3d6' }, { name: 'Chambray', hex: '#b6c7d6' }, { name: 'Denim', hex: '#6c86a0' }, { name: 'Blue Jean', hex: '#7391ae' },
  { name: 'Flo Blue', hex: '#5b98cf' }, { name: 'Midnight', hex: '#212b45' }, { name: 'Navy', hex: '#2c3a57' }, { name: 'Grey', hex: '#9a9a97' },
  { name: 'Graphite', hex: '#5b5d5f' }, { name: 'Pepper', hex: '#4a4a48' }, { name: 'Black', hex: '#1d1d1d' },
]
// Where the print sits, in the shirt's 600 x 640 drawing. A 12 in print is about 160 units wide (the chest is about 22 in = 320 units).
const PRINTS = [
  { label: 'Full chest · 12 in wide', inches: 12, cx: 300, top: 190 },
  { label: 'Large · 14 in wide', inches: 14, cx: 300, top: 180 },
  { label: 'Medium · 9 in wide', inches: 9, cx: 300, top: 190 },
  { label: 'Left pocket · 4 in wide', inches: 4, cx: 378, top: 200 },
]
const UNITS_PER_INCH = 320 / 22
// Relaxed, boxy front view of a garment-dyed heavyweight tee: dropped shoulders, short wide sleeves, thick rib collar.
// Drawn in a 600 x 640 box and moved down 40 so it sits in the middle.
const BODY = 'M232 62 L160 82 L52 170 L88 238 L140 206 L140 486 Q140 500 154 500 L446 500 Q460 500 460 486 L460 206 L512 238 L548 170 L440 82 L368 62 Q300 112 232 62 Z'
const NECK_BACK = 'M232 62 Q300 22 368 62 Q300 112 232 62 Z'
const shirtSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 640"><defs><clipPath id="c"><path d="${BODY}"/></clipPath>` +
  `<filter id="m" x="0" y="-40" width="100%" height="640" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .9 0 0 0 -.3"/></filter>` +
  `<linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset=".2" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>` +
  `<g transform="translate(0 40)">` +
  `<path d="${NECK_BACK}" fill="${color}"/><path d="${NECK_BACK}" fill="rgba(0,0,0,.3)"/>` +
  `<path d="${BODY}" fill="${color}"/>` +
  `<g clip-path="url(#c)"><rect x="0" y="-40" width="600" height="640" filter="url(#m)" opacity=".1"/><rect x="0" y="-40" width="600" height="640" fill="url(#g)"/></g>` +
  `<path d="M232 62 Q300 112 368 62" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="11"/>` +
  `<path d="M160 82 Q146 140 140 206 M440 82 Q454 140 460 206 M160 82 L232 62 M440 82 L368 62" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="2.5"/>` +
  `<path d="M142 482 L458 482 M62 176 L96 236 M538 176 L504 236" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="2" stroke-dasharray="6 5"/>` +
  `<path d="${BODY}" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="3" stroke-linejoin="round"/></g></svg>`
// Make the flat background colour around a picture see-through (for art saved with a solid box behind it).
// It finds the edges of the visible art, looks at the four corners of that area, and if they are all the same
// solid colour, that colour becomes transparent with a soft edge.
const knockOutBackground = (src: string) =>
  new Promise<string>((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const w = img.width, h = img.height
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, w, h)
      const d = data.data
      let x0 = w, y0 = h, x1 = -1, y1 = -1
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      }
      if (x1 < 0) return resolve(src)
      const at = (x: number, y: number) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]] }
      const m = 2
      const corners = [at(x0 + m, y0 + m), at(x1 - m, y0 + m), at(x0 + m, y1 - m), at(x1 - m, y1 - m)]
      const key = corners[0]
      const solid = corners.every((q) => q[3] > 240 && Math.hypot(q[0] - key[0], q[1] - key[1], q[2] - key[2]) < 24)
      if (!solid) return resolve(src) // already see-through, or not a flat box
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.hypot(d[i] - key[0], d[i + 1] - key[1], d[i + 2] - key[2])
        d[i + 3] = Math.round(d[i + 3] * Math.min(1, Math.max(0, (dist - 18) / 50)))
      }
      ctx.putImageData(data, 0, 0)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
const shirtUri = (color: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(shirtSvg(color))
const FONT_COMBOS = [
  { label: 'Add a heading', size: 120, bold: true, font: 0 },
  { label: 'Add a subheading', size: 64, bold: true, font: 0 },
  { label: 'Add a little bit of body text', size: 36, bold: false, font: 0 },
  { label: 'Elegant serif title', size: 110, bold: false, font: 1 },
  { label: 'Friendly sans title', size: 100, bold: true, font: 2 },
  { label: 'Typewriter note', size: 40, bold: false, font: 3 },
]

export default function Editor() {
  const { design, pageIndex, selectedId, brand, add, update, remove, duplicate, reorder, undo, redo, setDesign, setPage, replaceAll, setBrand, close, select, selectPage, addPage, duplicatePage, removePage, movePage } = useStore()
  const past = useStore((s) => s.past.length)
  const future = useStore((s) => s.future.length)
  const stageRef = useRef<Konva.Stage | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const [zoom, setZoom] = useState(0.5)
  const [fit, setFit] = useState(true)
  const [saved, setSaved] = useState(true)
  const [tab, setTab] = useState<Tab | null>(() => (window.innerWidth < 800 ? null : 'design'))
  const [uploads, setUploads] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [guides, setGuides] = useState(false)
  const [mockColor, setMockColor] = useState(SHIRTS.find((c) => c.name === 'Black')!.hex)
  const [mockUrl, setMockUrl] = useState<string | null>(null)
  const [rawArt, setRawArt] = useState<string | null>(null)
  const [knock, setKnock] = useState(true)
  const [printIdx, setPrintIdx] = useState(0)
  const [userMocks, setUserMocks] = useState<PhotoMock[]>([])
  const [mockSel, setMockSel] = useState<string>(BUILTIN_MOCKS[0].id)
  const mockFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!design || !fit || !wrapRef.current) return
    const calc = () => {
      const r = wrapRef.current!.getBoundingClientRect()
      const pad = window.innerWidth < 800 ? 32 : 80
      setZoom(Math.max(0.05, Math.min((r.width - pad) / design.width, (r.height - pad) / design.height, 1)))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [design?.width, design?.height, fit, tab, design?.pages.length])

  useEffect(() => {
    if (!design) return
    setSaved(false)
    const t = setTimeout(() => saveDesign(design).then(() => setSaved(true)), 700)
    return () => clearTimeout(t)
  }, [design])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const mod = e.metaKey || e.ctrlKey
      const id = useStore.getState().selectedId
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (id) duplicate(id) }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (id) remove(id) }
      else if (id && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const st = useStore.getState(); const el = st.design?.pages[st.pageIndex]?.elements.find((x) => x.id === id)
        if (!el) return
        const s = e.shiftKey ? 10 : 1
        update(id, { x: el.x + (e.key === 'ArrowRight' ? s : e.key === 'ArrowLeft' ? -s : 0), y: el.y + (e.key === 'ArrowDown' ? s : e.key === 'ArrowUp' ? -s : 0) })
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [undo, redo, remove, duplicate, update])

  if (!design) return null
  const page = design.pages[Math.min(pageIndex, design.pages.length - 1)]
  const sel = page.elements.find((e) => e.id === selectedId) as El | undefined
  const cx = design.width / 2, cy = design.height / 2
  const k = Math.max(0.5, design.width / 1080) // new items are sized for the canvas

  const addText = (size: number, bold: boolean, content: string, font = 0) => {
    const el: TextEl = { id: uid(), type: 'text', x: cx - 400 * k, y: cy - (size * k) / 2, width: 800 * k, height: 0, rotation: 0, opacity: 1, text: content, fontSize: Math.round(size * k), fontFamily: brand.fonts[font] ?? brand.fonts[0], fontStyle: bold ? 'bold' : 'normal', align: 'center', fill: brand.colors[2] }
    add(el)
  }
  const addShape = (type: 'rect' | 'ellipse', o: Partial<ShapeEl> = {}) => {
    const el: ShapeEl = { id: uid(), type, x: cx - 150 * k, y: cy - 150 * k, width: 300 * k, height: 300 * k, rotation: 0, opacity: 1, fill: brand.colors[0], stroke: brand.colors[2], strokeWidth: 0, cornerRadius: 0, ...o }
    add(el)
  }
  const addImage = (src: string, w = 400) => {
    const i = new window.Image()
    i.onload = () => {
      const ww = Math.min(w * k, design.width * 0.8), h = (i.height / i.width) * ww
      add({ id: uid(), type: 'image', src, x: cx - ww / 2, y: cy - h / 2, width: ww, height: h, rotation: 0, opacity: 1 })
    }
    i.src = src
  }
  // Scale an image down and compress it so designs stay small enough to save.
  const shrink = (src: string, max: number) =>
    new Promise<string>((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
        const ctx = c.getContext('2d')
        if (!ctx) return resolve(src)
        ctx.drawImage(img, 0, 0, c.width, c.height)
        const out = c.toDataURL('image/webp', 0.85)
        resolve(out.startsWith('data:image/webp') ? out : c.toDataURL('image/png'))
      }
      img.onerror = () => resolve(src)
      img.src = src
    })
  const readFile = (f: File | undefined, cb: (s: string) => void, max = 1600) => {
    if (!f) return
    const r = new FileReader()
    r.onload = () => shrink(r.result as string, max).then(cb)
    r.readAsDataURL(f)
  }
  const removeBg = async (id: string, src: string, original?: string) => {
    setBusy('Removing background… the first time it downloads a model (about 40 MB), so it can take a minute.')
    try {
      const { removeBackground } = await import('@imgly/background-removal')
      const blob = await removeBackground(original ?? src, { output: { format: 'image/png' } })
      const url: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(blob) })
      update(id, { src: await shrink(url, 1600), original: original ?? src } as Partial<El>)
    } catch (e) {
      console.error(e)
      alert('Could not remove the background. Check your internet connection and try again.')
    } finally {
      setBusy(null)
    }
  }
  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)!
    const hasContent = design.pages.some((p) => p.elements.length)
    if (hasContent && !confirm('Replace the current design with this template?')) return
    const d = buildDesign(t, brand)
    replaceAll({ width: d.width, height: d.height, pages: d.pages })
    setFit(true)
  }
  const alignSel = (k: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const n = stageRef.current?.findOne('#' + (sel?.id ?? ''))
    if (!n || !sel) return
    const r = n.getClientRect(), W = design.width * zoom, H = design.height * zoom
    let dx = 0, dy = 0
    if (k === 'left') dx = -r.x
    if (k === 'center') dx = W / 2 - (r.x + r.width / 2)
    if (k === 'right') dx = W - (r.x + r.width)
    if (k === 'top') dy = -r.y
    if (k === 'middle') dy = H / 2 - (r.y + r.height / 2)
    if (k === 'bottom') dy = H - (r.y + r.height)
    update(sel.id, { x: sel.x + dx / zoom, y: sel.y + dy / zoom })
  }

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const flatten = (png: string) =>
    new Promise<string>((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
        const ctx = c.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0)
        resolve(c.toDataURL('image/jpeg', 0.95))
      }
      img.src = png
    })
  // the canvas is drawn at screen zoom, so the picture can come out a pixel short; make it exactly the design size
  const exact = (url: string, mime: 'image/png' | 'image/jpeg') =>
    new Promise<string>((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        if (img.width === design.width && img.height === design.height) return resolve(url)
        const c = document.createElement('canvas'); c.width = design.width; c.height = design.height
        const ctx = c.getContext('2d')!
        if (mime === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height) }
        ctx.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL(mime, 0.95))
      }
      img.src = url
    })
  const render = async (mime: 'image/png' | 'image/jpeg') => {
    select(null)
    await wait(60)
    const st = stageRef.current!
    if (mime === 'image/jpeg' && page.background === 'transparent') return exact(await flatten(st.toDataURL({ pixelRatio: 1 / zoom, mimeType: 'image/png' })), 'image/jpeg')
    return exact(st.toDataURL({ pixelRatio: 1 / zoom, mimeType: mime, quality: 0.95 }), mime)
  }
  const download = (href: string, name: string) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click() }
  const exportAs = async (kind: 'png' | 'jpg' | 'pdf') => {
    setMenu(false)
    const base = design.name.replace(/[^\w-]+/g, '_') || 'design'
    if (kind === 'png') download(await render('image/png'), base + (design.pages.length > 1 ? `-page${pageIndex + 1}` : '') + '.png')
    else if (kind === 'jpg') download(await render('image/jpeg'), base + (design.pages.length > 1 ? `-page${pageIndex + 1}` : '') + '.jpg')
    else {
      const start = pageIndex
      setBusy('Making your PDF…')
      const pdf = new jsPDF({ orientation: design.width >= design.height ? 'l' : 'p', unit: 'px', format: [design.width, design.height] })
      for (let i = 0; i < design.pages.length; i++) {
        selectPage(i)
        await wait(250)
        if (i > 0) pdf.addPage([design.width, design.height], design.width >= design.height ? 'l' : 'p')
        pdf.addImage(await render('image/jpeg'), 'JPEG', 0, 0, design.width, design.height)
      }
      selectPage(start)
      setBusy(null)
      pdf.save(base + '.pdf')
    }
  }

  const refreshMock = async () => {
    select(null)
    await wait(60)
    const st = stageRef.current
    if (!st) return
    // leave the page background out: the mockup should show only your art
    const bg = st.findOne('.bg')
    bg?.hide()
    const url = st.toDataURL({ pixelRatio: Math.min(1, 1200 / (design.width * zoom)), mimeType: 'image/png' })
    bg?.show()
    setRawArt(url)
  }
  useEffect(() => {
    if (!rawArt) return
    let live = true
    if (knock) knockOutBackground(rawArt).then((u) => live && setMockUrl(u))
    else setMockUrl(rawArt)
    return () => { live = false }
  }, [rawArt, knock])
  const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new window.Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
  const downloadMock = async () => {
    if (!mockUrl) return
    const [shirt, art] = await Promise.all([loadImg(shirtUri(mockColor)), loadImg(mockUrl)])
    const c = document.createElement('canvas'); c.width = 2048; c.height = 2048
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#f1ede3'; ctx.fillRect(0, 0, 2048, 2048)
    const sw = 1800, sh = 1920, sx = 124, sy = 64
    ctx.drawImage(shirt, sx, sy, sw, sh)
    const pr = PRINTS[printIdx], u = sw / 600
    const aw = pr.inches * UNITS_PER_INCH * u, ah = aw * (design.height / design.width)
    ctx.drawImage(art, sx + pr.cx * u - aw / 2, sy + pr.top * u, aw, ah)
    download(c.toDataURL('image/png'), (design.name.replace(/[^\w-]+/g, '_') || 'design') + '-mockup.png')
  }
  useEffect(() => { listUserMocks().then(setUserMocks) }, [])
  const allMocks: PhotoMock[] = [...BUILTIN_MOCKS.map((m) => ({ ...m, place: loadPlace(m) })), ...userMocks]
  const photoMock = allMocks.find((m) => m.id === mockSel)
  const addMockPhoto = (f: File | undefined) => {
    if (!f) return
    readFile(f, (src) => {
      const m: PhotoMock = { id: 'u' + uid(), name: f.name.replace(/\.[^.]+$/, '') || 'My mockup', src, place: { cx: 0.5, top: 0.3, width: 0.3 } }
      saveUserMock(m).then(() => { setUserMocks((u) => [...u, m]); setMockSel(m.id) })
    }, 2000)
  }
  useEffect(() => { if (tab === 'mockup') refreshMock() }, [tab, pageIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<El>) => sel && update(sel.id, p)
  const num = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0)
  const Colors = ({ onPick }: { onPick: (c: string) => void }) => (
    <div className="swatches">{brand.colors.map((c, i) => <button key={i} className="swatch" style={{ background: c }} title={c} onClick={() => onPick(c)} />)}</div>
  )

  return (
    <div className="editor">
      <header className="topbar">
        <button className="ghost" onClick={() => { saveDesign(design); close() }}>← Home</button>
        <input className="title" value={design.name} onChange={(e) => setDesign({ name: e.target.value }, false)} />
        <span className="muted small save-status">{saved ? 'All changes saved' : 'Saving…'}</span>
        <span className="spacer" />
        <button className="ghost" disabled={!past} onClick={undo} title="Undo">↶ Undo</button>
        <button className="ghost" disabled={!future} onClick={redo} title="Redo">↷ Redo</button>
        <div className="menu">
          <button className="primary" onClick={() => setMenu((m) => !m)}><span className="long">Share / Download</span><span className="short">Export</span> ▾</button>
          {menu && (
            <div className="menu-list">
              <button onClick={() => exportAs('png')}>PNG{design.pages.length > 1 ? ' (this page)' : ''}</button>
              <button onClick={() => exportAs('jpg')}>JPG{design.pages.length > 1 ? ' (this page)' : ''}</button>
              <button onClick={() => exportAs('pdf')}>PDF{design.pages.length > 1 ? ' (all pages)' : ''}</button>
            </div>
          )}
        </div>
      </header>

      <nav className="rail">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'rail-btn on' : 'rail-btn'} onClick={() => setTab(tab === t.id ? null : t.id)}>
            <span className="rail-icon">{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </nav>

      {tab && (
        <aside className="drawer">
          {tab === 'design' && (
            <>
              <h3>Templates</h3>
              <div className="tpl-grid">
                {TEMPLATES.map((t) => (
                  <button key={t.id} className="card" onClick={() => applyTemplate(t.id)}>
                    <TplThumb t={t} /><span className="small">{t.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === 'elements' && (
            <>
              <h3>Shapes</h3>
              <div className="shape-grid">
                <button className="shape" onClick={() => addShape('rect')}><i style={{ background: brand.colors[0] }} /></button>
                <button className="shape" onClick={() => addShape('rect', { cornerRadius: 60 })}><i style={{ background: brand.colors[0], borderRadius: 10 }} /></button>
                <button className="shape" onClick={() => addShape('ellipse')}><i style={{ background: brand.colors[0], borderRadius: '50%' }} /></button>
                <button className="shape" onClick={() => addShape('rect', { width: 500 * k, height: 16 * k, y: cy })}><i style={{ background: brand.colors[2], height: 3, width: '80%' }} /></button>
                <button className="shape" onClick={() => addShape('rect', { fill: 'transparent', strokeWidth: 8 })}><i style={{ border: `3px solid ${brand.colors[2]}` }} /></button>
                <button className="shape" onClick={() => addShape('ellipse', { fill: 'transparent', strokeWidth: 8 })}><i style={{ border: `3px solid ${brand.colors[2]}`, borderRadius: '50%' }} /></button>
              </div>
              <h3>Colour blocks</h3>
              <div className="shape-grid">
                {brand.colors.map((c, i) => (
                  <button key={i} className="shape" onClick={() => addShape('rect', { fill: c, width: design.width, height: Math.round(design.height / 3), x: 0, y: design.height / 3 })}><i style={{ background: c }} /></button>
                ))}
              </div>
            </>
          )}
          {tab === 'text' && (
            <>
              <h3>Text</h3>
              {FONT_COMBOS.map((c) => (
                <button key={c.label} className="textbtn" style={{ fontFamily: brand.fonts[c.font], fontWeight: c.bold ? 700 : 400, fontSize: Math.min(26, c.size / 4) }} onClick={() => addText(c.size, c.bold, c.label.replace('Add a ', '').replace(/^./, (m) => m.toUpperCase()), c.font)}>
                  {c.label}
                </button>
              ))}
            </>
          )}
          {tab === 'brand' && (
            <>
              <h3>Brand kit</h3>
              <label>Name<input value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} /></label>
              <label>Tagline<input value={brand.tagline} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} /></label>
              <h4>Colours</h4>
              <div className="swatches">
                {brand.colors.map((c, i) => (
                  <label key={i} className="swatch" style={{ background: c }}>
                    <input type="color" value={c} onChange={(e) => { const colors = [...brand.colors]; colors[i] = e.target.value; setBrand({ ...brand, colors }) }} />
                  </label>
                ))}
              </div>
              <h4>Logo</h4>
              {brand.logo && <img src={brand.logo} alt="logo" className="logo-preview" />}
              <div className="row">
                {brand.logo && <button onClick={() => addImage(brand.logo!, 300)}>Add to design</button>}
                <button onClick={() => logoRef.current?.click()}>Upload logo</button>
              </div>
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => { readFile(e.target.files?.[0], (s) => setBrand({ ...brand, logo: s }), 600); e.target.value = '' }} />
            </>
          )}
          {tab === 'uploads' && (
            <>
              <h3>Uploads</h3>
              <button className="primary" onClick={() => fileRef.current?.click()}>Upload files</button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { Array.from(e.target.files ?? []).forEach((f) => readFile(f, (s) => { setUploads((u) => [s, ...u]); addImage(s) })); e.target.value = '' }} />
              <div className="up-grid">{uploads.map((u, i) => <img key={i} src={u} alt="" onClick={() => addImage(u)} />)}</div>
              <p className="muted small">Uploaded images in this session appear here. Click one to add it again.</p>
            </>
          )}
          {tab === 'mockup' && (
            <>
              <h3>Mockup</h3>
              <label>Style
                <select value={mockSel} onChange={(e) => setMockSel(e.target.value)}>
                  <option value="drawn">Drawn Comfort Colors 1717 · pick any colour</option>
                  {allMocks.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="check"><input type="checkbox" checked={knock} onChange={(e) => setKnock(e.target.checked)} /> Clear any solid box around my art</label>
              <button onClick={() => mockFileRef.current?.click()}>+ Add my own mockup photo</button>
              <input ref={mockFileRef} type="file" accept="image/*" hidden onChange={(e) => { addMockPhoto(e.target.files?.[0]); e.target.value = '' }} />
              {photoMock ? (
                <>
                  <PhotoMockup key={photoMock.id} mock={photoMock} art={mockUrl} aspect={design.height / design.width} filename={design.name.replace(/[^\w-]+/g, '_') || 'design'}
                    onDelete={photoMock.builtin ? undefined : () => { deleteUserMock(photoMock.id); setUserMocks((u) => u.filter((x) => x.id !== photoMock.id)); setMockSel('drawn') }} />
                  <div className="row"><button onClick={refreshMock}>Update art from page</button></div>
                  <p className="muted small">Use a transparent background so only your art shows. For your own photos, use a flat shirt photo with plain fabric where the print goes.</p>
                </>
              ) : (
                <>
              <div className="shirt-preview">
                <img className="shirt" src={shirtUri(mockColor)} alt="" />
                {mockUrl && (() => {
                  const pr = PRINTS[printIdx], w = pr.inches * UNITS_PER_INCH
                  return <img className="shirt-art" src={mockUrl} alt="" style={{ left: `${((pr.cx - w / 2) / 600) * 100}%`, top: `${(pr.top / 640) * 100}%`, width: `${(w / 600) * 100}%`, height: 'auto' }} />
                })()}
              </div>
              <p className="small"><b>{SHIRTS.find((c) => c.hex === mockColor)?.name}</b></p>
              <div className="swatches">
                {SHIRTS.map((c) => <button key={c.hex} className="swatch" style={{ background: c.hex, outline: c.hex === mockColor ? '2px solid var(--accent)' : 'none', outlineOffset: 1 }} title={c.name} onClick={() => setMockColor(c.hex)} />)}
              </div>
              <label>Print size on the shirt
                <select value={printIdx} onChange={(e) => setPrintIdx(+e.target.value)}>
                  {PRINTS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                </select>
              </label>
              <div className="row">
                <button onClick={refreshMock}>Update preview</button>
                <button className="primary" onClick={downloadMock} disabled={!mockUrl}>Download</button>
              </div>
              <p className="muted small">The print size is the width of your whole canvas, so trim empty space around the art. Use a transparent background. The download is 2048 × 2048, ready for a Shopify listing. Shirt colours are close matches, not exact.</p>
                </>
              )}
            </>
          )}
        </aside>
      )}

      <section className="work">
        <div className="ctx">
          {!sel ? (
            <>
              <span className="muted small">Page {pageIndex + 1} colour</span>
              <input type="color" value={page.background === 'transparent' ? '#ffffff' : page.background} onChange={(e) => setPage({ background: e.target.value }, false)} />
              <button className={page.background === 'transparent' ? 'on' : ''} title="No background, for print files" onClick={() => setPage({ background: page.background === 'transparent' ? '#ffffff' : 'transparent' })}>Transparent</button>
              <Colors onPick={(c) => setPage({ background: c })} />
              <span className="divider" />
              <label className="inline">W<input type="number" value={design.width} onChange={(e) => setDesign({ width: Math.max(100, num(e.target.value)) })} /></label>
              <label className="inline">H<input type="number" value={design.height} onChange={(e) => setDesign({ height: Math.max(100, num(e.target.value)) })} /></label>
              <select value="" onChange={(e) => { const pr = PRESETS.find((x) => x.id === e.target.value); if (pr) { setDesign({ width: pr.width, height: pr.height }); setFit(true) } }}>
                <option value="">Resize to…</option>
                {PRESETS.map((pr) => <option key={pr.id} value={pr.id}>{pr.label} · {pr.width}×{pr.height}</option>)}
              </select>
            </>
          ) : (
            <>
              {sel.type === 'text' && (
                <>
                  <select value={sel.fontFamily} onChange={(e) => patch({ fontFamily: e.target.value })}>
                    {[...new Set([...brand.fonts, 'Arial', 'Verdana', 'Times New Roman'])].map((f) => <option key={f}>{f}</option>)}
                  </select>
                  <button onClick={() => patch({ fontSize: Math.max(8, sel.fontSize - 4) })}>−</button>
                  <input className="num" type="number" value={sel.fontSize} onChange={(e) => patch({ fontSize: Math.max(8, num(e.target.value)) })} />
                  <button onClick={() => patch({ fontSize: sel.fontSize + 4 })}>+</button>
                  <button className={sel.fontStyle.includes('bold') ? 'on' : ''} onClick={() => patch({ fontStyle: sel.fontStyle.includes('bold') ? (sel.fontStyle.includes('italic') ? 'italic' : 'normal') : (sel.fontStyle.includes('italic') ? 'bold italic' : 'bold') })}><b>B</b></button>
                  <button className={sel.fontStyle.includes('italic') ? 'on' : ''} onClick={() => patch({ fontStyle: sel.fontStyle.includes('italic') ? (sel.fontStyle.includes('bold') ? 'bold' : 'normal') : (sel.fontStyle.includes('bold') ? 'bold italic' : 'italic') })}><i>I</i></button>
                  {(['left', 'center', 'right'] as const).map((a) => <button key={a} className={sel.align === a ? 'on' : ''} onClick={() => patch({ align: a })}>{a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}</button>)}
                  <span className="divider" />
                  <textarea className="inline-text" rows={1} value={sel.text} onChange={(e) => patch({ text: e.target.value })} />
                </>
              )}
              {sel.type === 'image' && (
                <>
                  <button className="primary" disabled={!!busy} onClick={() => removeBg(sel.id, sel.src, sel.original)}>✂ Remove background</button>
                  {sel.original && <button disabled={!!busy} onClick={() => update(sel.id, { src: sel.original, original: undefined } as Partial<El>)}>Restore original</button>}
                  <span className="divider" />
                </>
              )}
              {sel.type !== 'image' && (
                <>
                  <span className="muted small">Colour</span>
                  <input type="color" value={sel.fill === 'transparent' ? '#ffffff' : sel.fill} onChange={(e) => patch({ fill: e.target.value })} />
                  <Colors onPick={(c) => patch({ fill: c })} />
                </>
              )}
              {(sel.type === 'rect' || sel.type === 'ellipse') && (
                <>
                  <span className="divider" />
                  <span className="muted small">Border</span>
                  <input type="color" value={sel.stroke} onChange={(e) => patch({ stroke: e.target.value })} />
                  <input className="num" type="number" title="Border width" value={sel.strokeWidth} onChange={(e) => patch({ strokeWidth: Math.max(0, num(e.target.value)) })} />
                  {sel.type === 'rect' && <><span className="muted small">Radius</span><input className="num" type="number" value={sel.cornerRadius} onChange={(e) => patch({ cornerRadius: Math.max(0, num(e.target.value)) })} /></>}
                </>
              )}
              <span className="divider" />
              <span className="muted small">Opacity</span>
              <input className="slider" type="range" min={0} max={1} step={0.05} value={sel.opacity} onChange={(e) => patch({ opacity: +e.target.value })} />
              <span className="muted small">Rotate</span>
              <input className="num" type="number" value={Math.round(sel.rotation)} onChange={(e) => patch({ rotation: num(e.target.value) })} />
              <span className="divider" />
              {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((k) => (
                <button key={k} title={`Align ${k} on page`} onClick={() => alignSel(k)}>{{ left: '⇤', center: '↔', right: '⇥', top: '⤒', middle: '↕', bottom: '⤓' }[k]}</button>
              ))}
              <span className="divider" />
              <button title="Bring forward" onClick={() => reorder(sel.id, 'up')}>⬆</button>
              <button title="Send backward" onClick={() => reorder(sel.id, 'down')}>⬇</button>
              <button title="Duplicate (Ctrl+D)" onClick={() => duplicate(sel.id)}>⧉</button>
              <button className="danger" title="Delete" onClick={() => remove(sel.id)}>🗑</button>
            </>
          )}
        </div>

        <div className="stage-wrap" ref={wrapRef}>
          <div className={page.background === 'transparent' ? 'stage-shadow checker' : 'stage-shadow'}>
            <Canvas stageRef={stageRef} zoom={zoom} />
            {guides && <div className="guides"><i className="box" /><i className="gv" /><i className="gh" /></div>}
          </div>
        </div>

        <div className="pages">
          {design.pages.map((p, i) => (
            <div key={p.id} className={i === pageIndex ? 'pg on' : 'pg'}>
              <button className="pg-thumb" onClick={() => selectPage(i)} aria-label={`Page ${i + 1}`}><Thumb width={design.width} height={design.height} page={p} /></button>
              <div className="pg-row">
                <span className="small">{i + 1}</span>
                {i === pageIndex && (
                  <>
                    <button className="ghost" title="Move earlier" disabled={i === 0} onClick={() => movePage(i, -1)}>‹</button>
                    <button className="ghost" title="Move later" disabled={i === design.pages.length - 1} onClick={() => movePage(i, 1)}>›</button>
                    <button className="ghost" title="Duplicate page" onClick={() => duplicatePage(i)}>⧉</button>
                    <button className="ghost danger" title="Delete page" disabled={design.pages.length < 2} onClick={() => removePage(i)}>🗑</button>
                  </>
                )}
              </div>
            </div>
          ))}
          <button className="pg-add" onClick={addPage}>+ Add page</button>
        </div>

        <footer className="bottombar">
          <span className="muted small">{design.width} × {design.height}px</span>
          <button className={guides ? 'on' : 'ghost'} title="Show centre lines and a safe margin. They are not exported." onClick={() => setGuides((g) => !g)}>Guides</button>
          <span className="spacer" />
          <input className="slider" type="range" min={10} max={200} value={Math.round(zoom * 100)} onChange={(e) => { setFit(false); setZoom(+e.target.value / 100) }} />
          <span className="small zoomval">{Math.round(zoom * 100)}%</span>
          <button className="ghost" onClick={() => setFit(true)}>Fit</button>
        </footer>
      </section>
      {busy && <div className="busy"><div className="busy-box"><div className="spinner" />{busy}</div></div>}
    </div>
  )
}

function TplThumb({ t }: { t: (typeof TEMPLATES)[number] }) {
  const brand = useStore((s) => s.brand)
  const d = buildDesign(t, brand)
  return <Thumb width={d.width} height={d.height} page={d.pages[0]} />
}
