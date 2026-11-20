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
}
export type El = TextEl | ShapeEl | ImageEl

export interface Design {
  id: string
  name: string
  width: number
  height: number
  background: string
  elements: El[]
  updatedAt: number
}

export interface BrandKit {
  name: string
  tagline: string
  colors: string[]
  fonts: string[]
  logo: string | null
}
