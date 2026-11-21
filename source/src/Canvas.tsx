import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Ellipse, Text, Image as KImage, Transformer } from 'react-konva'
import Konva from 'konva'
import { useStore } from './store'
import type { El, ImageEl, TextEl } from './types'

const SNAP = 8 // screen pixels

function nearest(cands: number[], targets: number[]) {
  let best: { d: number; t: number } | null = null
  for (const c of cands) for (const t of targets) {
    const d = t - c
    if (Math.abs(d) < SNAP && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, t }
  }
  return best
}

function useImage(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    const i = new window.Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => setImg(i)
    i.src = src
  }, [src])
  return img
}

function ImageNode(props: { el: ImageEl; common: Record<string, unknown> }) {
  const img = useImage(props.el.src)
  return <KImage image={img ?? undefined} width={props.el.width} height={props.el.height} {...props.common} />
}

export default function Canvas({ stageRef, zoom }: { stageRef: React.RefObject<Konva.Stage | null>; zoom: number }) {
  const { design, pageIndex, selectedId, select, update } = useStore()
  const trRef = useRef<Konva.Transformer>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const guideRef = useRef<Konva.Layer>(null)
  const editRef = useRef<((n: Konva.Node, el: TextEl) => void) | null>(null)
  const page = design?.pages[Math.min(pageIndex, (design?.pages.length ?? 1) - 1)]

  useEffect(() => {
    const tr = trRef.current
    const layer = layerRef.current
    if (!tr || !layer) return
    const node = selectedId ? layer.findOne('#' + selectedId) : null
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, page?.elements, pageIndex])

  // double-click / double-tap on a text element starts typing. Listen to the browser's own
  // pointer events: the selection handles swallow the second press before Konva sees it.
  useEffect(() => {
    const c = stageRef.current?.container()
    if (!c) return
    let last: { t: number; x: number; y: number } | null = null
    const h = (ev: PointerEvent) => {
      const r = c.getBoundingClientRect()
      const x = ev.clientX - r.left, y = ev.clientY - r.top, now = Date.now()
      if (last && now - last.t < 450 && Math.hypot(x - last.x, y - last.y) < 12) {
        last = null
        const s = useStore.getState()
        const el = s.design?.pages[s.pageIndex]?.elements.find((e) => e.id === s.selectedId)
        const node = el ? layerRef.current?.findOne('#' + el.id) : null
        if (el && el.type === 'text' && node) setTimeout(() => editRef.current?.(node, el), 80)
      } else last = { t: now, x, y }
    }
    c.addEventListener('pointerdown', h)
    return () => c.removeEventListener('pointerdown', h)
  }, [design?.id, pageIndex])

  if (!design || !page) return null

  const Wz = design.width * zoom, Hz = design.height * zoom

  // snap targets: canvas edges and centre, plus edges and centres of the other elements
  const targets = (skipId: string | null) => {
    const tx = [0, Wz / 2, Wz], ty = [0, Hz / 2, Hz]
    const layer = layerRef.current
    if (layer) {
      for (const e of page.elements) {
        if (e.id === skipId) continue
        const n = layer.findOne('#' + e.id)
        if (!n) continue
        const r = n.getClientRect()
        tx.push(r.x, r.x + r.width / 2, r.x + r.width)
        ty.push(r.y, r.y + r.height / 2, r.y + r.height)
      }
    }
    return { tx, ty }
  }

  const drawGuides = (vs: number[], hs: number[]) => {
    const g = guideRef.current
    if (!g) return
    g.destroyChildren()
    const line = (pts: number[]) => g.add(new Konva.Line({ points: pts, stroke: '#e0457b', strokeWidth: 1.5 / zoom, dash: [6 / zoom, 4 / zoom], listening: false }))
    vs.forEach((x) => line([x / zoom, 0, x / zoom, design.height]))
    hs.forEach((y) => line([0, y / zoom, design.width, y / zoom]))
    g.batchDraw()
  }

  const onDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const n = e.target
    const { tx, ty } = targets(n.id())
    const b = n.getClientRect()
    const bx = nearest([b.x, b.x + b.width / 2, b.x + b.width], tx)
    const by = nearest([b.y, b.y + b.height / 2, b.y + b.height], ty)
    if (bx) n.x(n.x() + bx.d / zoom)
    if (by) n.y(n.y() + by.d / zoom)
    drawGuides(bx ? [bx.t] : [], by ? [by.t] : [])
  }

  const boundBox = (o: { x: number; y: number; width: number; height: number; rotation: number }, n: typeof o) => {
    if (n.width < 10 || n.height < 10) return o
    if (Math.abs(n.rotation) > 0.001) return n
    const { tx, ty } = targets(selectedId)
    let { x, y, width, height } = n
    const vs: number[] = [], hs: number[] = []
    if (Math.abs(n.x - o.x) > 0.01) {
      const b = nearest([x], tx)
      if (b) { width = x + width - b.t; x = b.t; vs.push(b.t) }
    }
    if (Math.abs(n.x + n.width - (o.x + o.width)) > 0.01) {
      const b = nearest([x + width], tx)
      if (b) { width = b.t - x; vs.push(b.t) }
    }
    if (Math.abs(n.y - o.y) > 0.01) {
      const b = nearest([y], ty)
      if (b) { height = y + height - b.t; y = b.t; hs.push(b.t) }
    }
    if (Math.abs(n.y + n.height - (o.y + o.height)) > 0.01) {
      const b = nearest([y + height], ty)
      if (b) { height = b.t - y; hs.push(b.t) }
    }
    drawGuides(vs, hs)
    return { ...n, x, y, width: Math.max(10, width), height: Math.max(10, height) }
  }

  // type directly on the canvas: a text box appears over the element
  const editText = (node: Konva.Node, el: TextEl) => {
    const stage = stageRef.current
    if (!stage) return
    const box = stage.container().getBoundingClientRect()
    const abs = node.absolutePosition()
    const ta = document.createElement('textarea')
    ta.value = el.text
    Object.assign(ta.style, {
      position: 'fixed', left: `${box.left + abs.x}px`, top: `${box.top + abs.y}px`, width: `${el.width * zoom}px`,
      fontSize: `${el.fontSize * zoom}px`, lineHeight: '1', fontFamily: el.fontFamily,
      fontWeight: el.fontStyle.includes('bold') ? '700' : '400', fontStyle: el.fontStyle.includes('italic') ? 'italic' : 'normal',
      textAlign: el.align, color: el.fill, background: 'transparent', border: '1px dashed #5f7f62', padding: '0', margin: '0',
      overflow: 'hidden', resize: 'none', outline: 'none', transformOrigin: 'left top', transform: `rotate(${el.rotation}deg)`, zIndex: '300',
    })
    document.body.appendChild(ta)
    const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px` }
    fit()
    node.hide(); trRef.current?.hide(); layerRef.current?.batchDraw()
    let done = false
    const finish = () => {
      if (done) return
      done = true
      const value = ta.value
      ta.remove()
      node.show(); trRef.current?.show(); layerRef.current?.batchDraw()
      if (value !== el.text) update(el.id, { text: value })
    }
    ta.addEventListener('input', fit)
    ta.addEventListener('blur', finish)
    ta.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') finish() })
    ta.focus(); ta.select()
  }

  editRef.current = editText

  const common = (el: El) => ({
    id: el.id,
    x: el.x, y: el.y, rotation: el.rotation, opacity: el.opacity,
    draggable: true,
    onMouseDown: () => select(el.id),
    onTap: () => select(el.id),
    onDragMove,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => { drawGuides([], []); update(el.id, { x: e.target.x(), y: e.target.y() }) },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      drawGuides([], [])
      const n = e.target
      const sx = n.scaleX(), sy = n.scaleY()
      n.scaleX(1); n.scaleY(1)
      const patch: Partial<El> = { x: n.x(), y: n.y(), rotation: n.rotation(), width: Math.max(10, n.width() * sx) }
      if (el.type !== 'text') (patch as { height: number }).height = Math.max(10, n.height() * sy)
      else (patch as { fontSize: number }).fontSize = Math.max(8, Math.round(el.fontSize * sy))
      update(el.id, patch)
    },
  })

  return (
    <Stage
      ref={stageRef}
      width={design.width * zoom}
      height={design.height * zoom}
      scaleX={zoom}
      scaleY={zoom}
      onMouseDown={(e) => { if (e.target === e.target.getStage() || e.target.name() === 'bg') select(null) }}
      onTouchStart={(e) => { if (e.target === e.target.getStage() || e.target.name() === 'bg') select(null) }}
    >
      <Layer ref={layerRef}>
        <Rect name="bg" x={0} y={0} width={design.width} height={design.height} fill={page.background} />
        {page.elements.map((el) => {
          const c = common(el)
          if (el.type === 'rect')
            return <Rect key={el.id} {...c} width={el.width} height={el.height} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} cornerRadius={el.cornerRadius} />
          if (el.type === 'ellipse')
            return <Ellipse key={el.id} {...c} offsetX={-el.width / 2} offsetY={-el.height / 2} radiusX={el.width / 2} radiusY={el.height / 2} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />
          if (el.type === 'text')
            return <Text key={el.id} {...c} text={el.text} width={el.width} fontSize={el.fontSize} fontFamily={el.fontFamily} fontStyle={el.fontStyle} align={el.align} fill={el.fill} />
          return <ImageNode key={el.id} el={el as ImageEl} common={c} />
        })}
        <Transformer ref={trRef} rotateEnabled keepRatio={false} boundBoxFunc={boundBox} />
      </Layer>
      <Layer ref={guideRef} listening={false} />
    </Stage>
  )
}
