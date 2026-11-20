import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Ellipse, Text, Image as KImage, Transformer } from 'react-konva'
import type Konva from 'konva'
import { useStore } from './store'
import type { El, ImageEl } from './types'

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
  const { design, selectedId, select, update } = useStore()
  const trRef = useRef<Konva.Transformer>(null)
  const layerRef = useRef<Konva.Layer>(null)

  useEffect(() => {
    const tr = trRef.current
    const layer = layerRef.current
    if (!tr || !layer) return
    const node = selectedId ? layer.findOne('#' + selectedId) : null
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, design?.elements])

  if (!design) return null

  const common = (el: El) => ({
    id: el.id,
    x: el.x, y: el.y, rotation: el.rotation, opacity: el.opacity,
    draggable: true,
    onMouseDown: () => select(el.id),
    onTap: () => select(el.id),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => update(el.id, { x: e.target.x(), y: e.target.y() }),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
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
    >
      <Layer ref={layerRef}>
        <Rect name="bg" x={0} y={0} width={design.width} height={design.height} fill={design.background} />
        {design.elements.map((el) => {
          const c = common(el)
          if (el.type === 'rect')
            return <Rect key={el.id} {...c} width={el.width} height={el.height} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} cornerRadius={el.cornerRadius} />
          if (el.type === 'ellipse')
            return <Ellipse key={el.id} {...c} offsetX={-el.width / 2} offsetY={-el.height / 2} radiusX={el.width / 2} radiusY={el.height / 2} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />
          if (el.type === 'text')
            return <Text key={el.id} {...c} text={el.text} width={el.width} fontSize={el.fontSize} fontFamily={el.fontFamily} fontStyle={el.fontStyle} align={el.align} fill={el.fill} />
          return <ImageNode key={el.id} el={el as ImageEl} common={c} />
        })}
        <Transformer ref={trRef} rotateEnabled keepRatio={false} boundBoxFunc={(o, n) => (n.width < 10 || n.height < 10 ? o : n)} />
      </Layer>
    </Stage>
  )
}
