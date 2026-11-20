import type { BrandKit, Design, El, TextEl, ShapeEl } from './types'
import { uid } from './store'

export interface Preset { id: string; label: string; width: number; height: number }
export const PRESETS: Preset[] = [
  { id: 'logo', label: 'Logo', width: 1000, height: 1000 },
  { id: 'card', label: 'Business card', width: 1050, height: 600 },
  { id: 'flyer', label: 'Flyer (A4)', width: 1240, height: 1754 },
  { id: 'social', label: 'Social post', width: 1080, height: 1080 },
  { id: 'banner', label: 'Banner', width: 1500, height: 500 },
  { id: 'story', label: 'Story', width: 1080, height: 1920 },
]

const text = (o: Partial<TextEl> & { text: string; x: number; y: number; width: number }): TextEl => ({
  id: uid(), type: 'text', height: 0, rotation: 0, opacity: 1, fontSize: 48, fontFamily: 'Inter',
  fontStyle: 'normal', align: 'left', fill: '#0f172a', ...o,
})
const shape = (o: Partial<ShapeEl> & { type: 'rect' | 'ellipse'; x: number; y: number; width: number; height: number }): ShapeEl => ({
  id: uid(), rotation: 0, opacity: 1, fill: '#6d28d9', stroke: '#000000', strokeWidth: 0, cornerRadius: 0, ...o,
})

export interface Template { id: string; label: string; preset: string; build: (b: BrandKit) => Omit<Design, 'id' | 'updatedAt'> }

const [c1, c2, c3, c4] = [0, 1, 2, 3]
const col = (b: BrandKit, i: number) => b.colors[i % b.colors.length]

export const TEMPLATES: Template[] = [
  {
    id: 'blank', label: 'Blank', preset: 'social',
    build: (b) => ({ name: 'Untitled', width: 1080, height: 1080, background: col(b, c4), elements: [] }),
  },
  {
    id: 'logo-mark', label: 'Logo lockup', preset: 'logo',
    build: (b) => ({
      name: `${b.name} logo`, width: 1000, height: 1000, background: col(b, c4),
      elements: [
        ...(b.logo
          ? [{ id: uid(), type: 'image', src: b.logo, x: 320, y: 200, width: 360, height: 360, rotation: 0, opacity: 1 } as El]
          : [
              shape({ type: 'ellipse', x: 300, y: 220, width: 400, height: 400, fill: col(b, c1) }),
              shape({ type: 'rect', x: 400, y: 320, width: 200, height: 200, fill: col(b, c2), cornerRadius: 40, rotation: 12 }),
            ]),
        text({ text: b.name, x: 100, y: 620, width: 800, fontSize: 110, fontStyle: 'bold', align: 'center', fill: col(b, c3), fontFamily: b.fonts[0] }),
        text({ text: b.tagline, x: 100, y: 770, width: 800, fontSize: 36, align: 'center', fill: col(b, c3), fontFamily: b.fonts[0], opacity: 0.7 }),
      ] as El[],
    }),
  },
  {
    id: 'business-card', label: 'Business card', preset: 'card',
    build: (b) => ({
      name: `${b.name} card`, width: 1050, height: 600, background: col(b, c3),
      elements: [
        shape({ type: 'rect', x: 0, y: 0, width: 40, height: 600, fill: col(b, c2) }),
        text({ text: 'Your Name', x: 90, y: 150, width: 700, fontSize: 72, fontStyle: 'bold', fill: col(b, c4), fontFamily: b.fonts[0] }),
        text({ text: `Founder · ${b.name}`, x: 90, y: 250, width: 700, fontSize: 36, fill: col(b, c2), fontFamily: b.fonts[0] }),
        text({ text: 'you@example.com\n+1 555 000 0000\nexample.com', x: 90, y: 370, width: 700, fontSize: 32, fill: col(b, c4), fontFamily: b.fonts[0] }),
      ] as El[],
    }),
  },
  {
    id: 'flyer', label: 'Event flyer', preset: 'flyer',
    build: (b) => ({
      name: `${b.name} flyer`, width: 1240, height: 1754, background: col(b, c4),
      elements: [
        shape({ type: 'rect', x: 0, y: 0, width: 1240, height: 780, fill: col(b, c1) }),
        shape({ type: 'ellipse', x: 760, y: 360, width: 700, height: 700, fill: col(b, c2), opacity: 0.9 }),
        text({ text: 'GRAND\nOPENING', x: 90, y: 160, width: 900, fontSize: 180, fontStyle: 'bold', fill: col(b, c4), fontFamily: b.fonts[0] }),
        text({ text: 'Saturday · 6 PM · Main Street', x: 90, y: 900, width: 1000, fontSize: 56, fontStyle: 'bold', fill: col(b, c3), fontFamily: b.fonts[0] }),
        text({ text: 'Join us for food, music and a first look at what we have been building.', x: 90, y: 1010, width: 900, fontSize: 40, fill: col(b, c3), fontFamily: b.fonts[0] }),
        text({ text: b.name, x: 90, y: 1600, width: 800, fontSize: 56, fontStyle: 'bold', fill: col(b, c1), fontFamily: b.fonts[0] }),
      ] as El[],
    }),
  },
  {
    id: 'social-quote', label: 'Quote post', preset: 'social',
    build: (b) => ({
      name: `${b.name} quote`, width: 1080, height: 1080, background: col(b, c1),
      elements: [
        shape({ type: 'rect', x: 60, y: 60, width: 960, height: 960, fill: 'transparent', stroke: col(b, c4), strokeWidth: 6 }),
        text({ text: '“Good design is as little design as possible.”', x: 130, y: 330, width: 820, fontSize: 84, fontStyle: 'bold', align: 'center', fill: col(b, c4), fontFamily: b.fonts[1] ?? b.fonts[0] }),
        text({ text: `— ${b.name}`, x: 130, y: 860, width: 820, fontSize: 40, align: 'center', fill: col(b, c2), fontFamily: b.fonts[0] }),
      ] as El[],
    }),
  },
  {
    id: 'banner', label: 'Announcement banner', preset: 'banner',
    build: (b) => ({
      name: `${b.name} banner`, width: 1500, height: 500, background: col(b, c3),
      elements: [
        shape({ type: 'rect', x: 1100, y: 0, width: 400, height: 500, fill: col(b, c2) }),
        text({ text: 'Something new is here', x: 80, y: 160, width: 1000, fontSize: 76, fontStyle: 'bold', fill: col(b, c4), fontFamily: b.fonts[0] }),
        text({ text: b.tagline, x: 80, y: 290, width: 1000, fontSize: 40, fill: col(b, c2), fontFamily: b.fonts[0] }),
      ] as El[],
    }),
  },
]
