import type { Design } from './types'

type D = Pick<Design, 'width' | 'height' | 'background' | 'elements'>
export default function Thumb({ d }: { d: D }) {
  return (
    <div className="thumb" style={{ background: d.background, aspectRatio: `${d.width}/${d.height}` }}>
      {d.elements.map((e) => (
        <div key={e.id} className="mini" style={{
          left: `${(e.x / d.width) * 100}%`, top: `${(e.y / d.height) * 100}%`,
          width: `${(e.width / d.width) * 100}%`, height: e.type === 'text' ? 'auto' : `${(e.height / d.height) * 100}%`,
          background: e.type === 'text' || e.type === 'image' ? 'transparent' : e.fill,
          border: e.type !== 'text' && e.type !== 'image' && e.strokeWidth ? `1px solid ${e.stroke}` : undefined,
          borderRadius: e.type === 'ellipse' ? '50%' : e.type === 'rect' ? `${e.cornerRadius / 10}px` : 0, opacity: e.opacity, transform: `rotate(${e.rotation}deg)`,
          color: e.type === 'text' ? e.fill : undefined, fontSize: e.type === 'text' ? `${(e.fontSize / d.width) * 170}px` : undefined,
          fontFamily: e.type === 'text' ? e.fontFamily : undefined,
          fontWeight: e.type === 'text' && e.fontStyle.includes('bold') ? 700 : 400, textAlign: e.type === 'text' ? e.align : undefined,
          lineHeight: 1.1, whiteSpace: 'pre-wrap', overflow: 'hidden',
        }}>
          {e.type === 'text' ? e.text : e.type === 'image' ? <img src={e.src} alt="" style={{ width: '100%', height: '100%' }} /> : ''}
        </div>
      ))}
    </div>
  )
}
