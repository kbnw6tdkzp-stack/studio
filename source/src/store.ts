import { create } from 'zustand'
import type { BrandKit, Design, El } from './types'
import { loadBrand, saveBrand } from './brand'

export const uid = () => Math.random().toString(36).slice(2, 10)

interface State {
  design: Design | null
  selectedId: string | null
  past: Design[]
  future: Design[]
  brand: BrandKit
  open: (d: Design) => void
  close: () => void
  select: (id: string | null) => void
  commit: () => void // snapshot for undo before a change
  update: (id: string, patch: Partial<El>, snapshot?: boolean) => void
  add: (el: El) => void
  remove: (id: string) => void
  duplicate: (id: string) => void
  reorder: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
  setDesign: (patch: Partial<Design>, snapshot?: boolean) => void
  undo: () => void
  redo: () => void
  setBrand: (b: BrandKit) => void
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

export const useStore = create<State>((set, get) => ({
  design: null,
  selectedId: null,
  past: [],
  future: [],
  brand: loadBrand(),
  open: (d) => set({ design: clone(d), selectedId: null, past: [], future: [] }),
  close: () => set({ design: null, selectedId: null, past: [], future: [] }),
  select: (id) => set({ selectedId: id }),
  commit: () => {
    const d = get().design
    if (d) set((s) => ({ past: [...s.past.slice(-99), clone(d)], future: [] }))
  },
  update: (id, patch, snapshot = true) => {
    const d = get().design
    if (!d) return
    if (snapshot) get().commit()
    set({
      design: {
        ...d,
        updatedAt: Date.now(),
        elements: d.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as El) : e)),
      },
    })
  },
  add: (el) => {
    const d = get().design
    if (!d) return
    get().commit()
    set({ design: { ...d, updatedAt: Date.now(), elements: [...d.elements, el] }, selectedId: el.id })
  },
  remove: (id) => {
    const d = get().design
    if (!d) return
    get().commit()
    set({ design: { ...d, updatedAt: Date.now(), elements: d.elements.filter((e) => e.id !== id) }, selectedId: null })
  },
  duplicate: (id) => {
    const d = get().design
    const el = d?.elements.find((e) => e.id === id)
    if (el) get().add({ ...clone(el), id: uid(), x: el.x + 24, y: el.y + 24 })
  },
  reorder: (id, dir) => {
    const d = get().design
    if (!d) return
    const els = [...d.elements]
    const i = els.findIndex((e) => e.id === id)
    if (i < 0) return
    const [el] = els.splice(i, 1)
    const j = dir === 'up' ? Math.min(i + 1, els.length) : dir === 'down' ? Math.max(i - 1, 0) : dir === 'top' ? els.length : 0
    els.splice(j, 0, el)
    get().commit()
    set({ design: { ...d, updatedAt: Date.now(), elements: els } })
  },
  setDesign: (patch, snapshot = true) => {
    const d = get().design
    if (!d) return
    if (snapshot) get().commit()
    set({ design: { ...d, ...patch, updatedAt: Date.now() } })
  },
  undo: () => {
    const { past, design, future } = get()
    if (!past.length || !design) return
    set({ design: past[past.length - 1], past: past.slice(0, -1), future: [clone(design), ...future], selectedId: null })
  },
  redo: () => {
    const { past, design, future } = get()
    if (!future.length || !design) return
    set({ design: future[0], future: future.slice(1), past: [...past, clone(design)], selectedId: null })
  },
  setBrand: (b) => {
    saveBrand(b)
    set({ brand: b })
  },
}))
