export type ElementType = 'text' | 'rect' | 'ellipse' | 'image'

export interface BaseEl {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
}
export interface TextEl extends BaseEl {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  fontStyle: 'normal' | 'bold' | 'italic' | 'bold italic'
  align: 'left' | 'center' | 'right'
  fill: string
}
export interface ShapeEl extends BaseEl {
  type: 'rect' | 'ellipse'
  fill: string
  stroke: string
  strokeWidth: number
  cornerRadius: number
}
export interface ImageEl extends BaseEl {
  type: 'image'
  src: string
  original?: string // kept so background removal can be undone
}
export type El = TextEl | ShapeEl | ImageEl

export interface Page {
  id: string
  background: string
  elements: El[]
}

export interface Design {
  id: string
  name: string
  width: number
  height: number
  pages: Page[]
  updatedAt: number
  // older designs stored a single page directly; they are converted when opened
  background?: string
  elements?: El[]
}

export interface BrandKit {
  name: string
  tagline: string
  colors: string[]
  fonts: string[]
  logo: string | null
}
