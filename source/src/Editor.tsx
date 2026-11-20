import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { jsPDF } from 'jspdf'
import Canvas from './Canvas'
import Thumb from './Thumb'
import { useStore, uid } from './store'
import { saveDesign } from './storage'
import { TEMPLATES } from './templates'
import type { El, ShapeEl, TextEl } from './types'

type Tab = 'design' | 'elements' | 'text' | 'brand' | 'uploads'
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'design', icon: '▦', label: 'Design' },
  { id: 'elements', icon: '◇', label: 'Elements' },
  { id: 'text', icon: 'T', label: 'Text' },
  { id: 'brand', icon: '❦', label: 'Brand' },
  { id: 'uploads', icon: '⇪', label: 'Uploads' },
]
const FONT_COMBOS = [
  { label: 'Add a heading', size: 120, bold: true, font: 0 },
  { label: 'Add a subheading', size: 64, bold: true, font: 0 },
  { label: 'Add a little bit of body text', size: 36, bold: false, font: 0 },
  { label: 'Elegant serif title', size: 110, bold: false, font: 1 },
  { label: 'Friendly sans title', size: 100, bold: true, font: 2 },
  { label: 'Typewriter note', size: 40, bold: false, font: 3 },
]

export default function Editor() {
  const { design, selectedId, brand, add, update, remove, duplicate, reorder, undo, redo, setDesign, setBrand, close, select } = useStore()
  const past = useStore((s) => s.past.length)
  const future = useStore((s) => s.future.length)
  const stageRef = useRef<Konva.Stage | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const [zoom, setZoom] = useState(0.5)
  const [fit, setFit] = useState(true)
  const [saved, setSaved] = useState(true)
  const [tab, setTab] = useState<Tab | null>('design')
  const [uploads, setUploads] = useState<string[]>([])

  useEffect(() => {
    if (!design || !fit || !wrapRef.current) return
    const calc = () => {
      const r = wrapRef.current!.getBoundingClientRect()
      setZoom(Math.max(0.05, Math.min((r.width - 80) / design.width, (r.height - 80) / design.height, 1)))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [design?.width, design?.height, fit, tab])

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
        const el = useStore.getState().design?.elements.find((x) => x.id === id)
        if (!el) return
        const s = e.shiftKey ? 10 : 1
        update(id, { x: el.x + (e.key === 'ArrowRight' ? s : e.key === 'ArrowLeft' ? -s : 0), y: el.y + (e.key === 'ArrowDown' ? s : e.key === 'ArrowUp' ? -s : 0) })
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [undo, redo, remove, duplicate, update])

  if (!design) return null
  const sel = design.elements.find((e) => e.id === selectedId) as El | undefined
  const cx = design.width / 2, cy = design.height / 2

  const addText = (size: number, bold: boolean, content: string, font = 0) => {
    const el: TextEl = { id: uid(), type: 'text', x: cx - 400, y: cy - size / 2, width: 800, height: 0, rotation: 0, opacity: 1, text: content, fontSize: size, fontFamily: brand.fonts[font] ?? brand.fonts[0], fontStyle: bold ? 'bold' : 'normal', align: 'center', fill: brand.colors[2] }
    add(el)
  }
  const addShape = (type: 'rect' | 'ellipse', o: Partial<ShapeEl> = {}) => {
    const el: ShapeEl = { id: uid(), type, x: cx - 150, y: cy - 150, width: 300, height: 300, rotation: 0, opacity: 1, fill: brand.colors[0], stroke: brand.colors[2], strokeWidth: 0, cornerRadius: 0, ...o }
    add(el)
  }
  const addImage = (src: string, w = 400) => {
    const i = new window.Image()
    i.onload = () => {
      const ww = Math.min(w, design.width * 0.8), h = (i.height / i.width) * ww
      add({ id: uid(), type: 'image', src, x: cx - ww / 2, y: cy - h / 2, width: ww, height: h, rotation: 0, opacity: 1 })
    }
    i.src = src
  }
  const readFile = (f: File | undefined, cb: (s: string) => void) => {
    if (!f) return
    const r = new FileReader()
    r.onload = () => cb(r.result as string)
    r.readAsDataURL(f)
  }
  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)!
    if (design.elements.length && !confirm('Replace the current design with this template?')) return
    const d = t.build(brand)
    setDesign({ width: d.width, height: d.height, background: d.background, elements: d.elements })
    setFit(true)
  }

  const render = (mime: 'image/png' | 'image/jpeg') => {
    const st = stageRef.current!
    select(null)
    return new Promise<string>((res) => setTimeout(() => res(st.toDataURL({ pixelRatio: 1 / zoom, mimeType: mime, quality: 0.95 })), 50))
  }
  const download = (href: string, name: string) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click() }
  const exportAs = async (kind: 'png' | 'jpg' | 'pdf') => {
    const base = design.name.replace(/[^\w-]+/g, '_') || 'design'
    if (kind === 'png') download(await render('image/png'), base + '.png')
    else if (kind === 'jpg') download(await render('image/jpeg'), base + '.jpg')
    else {
      const url = await render('image/jpeg')
      const pdf = new jsPDF({ orientation: design.width >= design.height ? 'l' : 'p', unit: 'px', format: [design.width, design.height] })
      pdf.addImage(url, 'JPEG', 0, 0, design.width, design.height)
      pdf.save(base + '.pdf')
    }
  }

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
        <span className="muted small">{saved ? 'All changes saved' : 'Saving…'}</span>
        <span className="spacer" />
        <button className="ghost" disabled={!past} onClick={undo} title="Undo">↶ Undo</button>
        <button className="ghost" disabled={!future} onClick={redo} title="Redo">↷ Redo</button>
        <div className="menu">
          <button className="primary">Share / Download ▾</button>
          <div className="menu-list">
            <button onClick={() => exportAs('png')}>PNG</button>
            <button onClick={() => exportAs('jpg')}>JPG</button>
            <button onClick={() => exportAs('pdf')}>PDF</button>
          </div>
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
                    <Thumb d={t.build(brand)} /><span className="small">{t.label}</span>
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
                <button className="shape" onClick={() => addShape('rect', { width: 500, height: 16, y: cy })}><i style={{ background: brand.colors[2], height: 3, width: '80%' }} /></button>
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
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => { readFile(e.target.files?.[0], (s) => setBrand({ ...brand, logo: s })); e.target.value = '' }} />
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
        </aside>
      )}

      <section className="work">
        <div className="ctx">
          {!sel ? (
            <>
              <span className="muted small">Page</span>
              <input type="color" value={design.background} onChange={(e) => setDesign({ background: e.target.value }, false)} />
              <Colors onPick={(c) => setDesign({ background: c })} />
              <span className="divider" />
              <label className="inline">W<input type="number" value={design.width} onChange={(e) => setDesign({ width: Math.max(100, num(e.target.value)) })} /></label>
              <label className="inline">H<input type="number" value={design.height} onChange={(e) => setDesign({ height: Math.max(100, num(e.target.value)) })} /></label>
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
              <button title="Bring forward" onClick={() => reorder(sel.id, 'up')}>⬆</button>
              <button title="Send backward" onClick={() => reorder(sel.id, 'down')}>⬇</button>
              <button title="Duplicate (Ctrl+D)" onClick={() => duplicate(sel.id)}>⧉</button>
              <button className="danger" title="Delete" onClick={() => remove(sel.id)}>🗑</button>
            </>
          )}
        </div>

        <div className="stage-wrap" ref={wrapRef}>
          <div className="stage-shadow"><Canvas stageRef={stageRef} zoom={zoom} /></div>
        </div>

        <footer className="bottombar">
          <span className="muted small">{design.width} × {design.height}px</span>
          <span className="spacer" />
          <input className="slider" type="range" min={10} max={200} value={Math.round(zoom * 100)} onChange={(e) => { setFit(false); setZoom(+e.target.value / 100) }} />
          <span className="small zoomval">{Math.round(zoom * 100)}%</span>
          <button className="ghost" onClick={() => setFit(true)}>Fit</button>
        </footer>
      </section>
    </div>
  )
}
