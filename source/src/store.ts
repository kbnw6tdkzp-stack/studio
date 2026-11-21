import { create } from 'zustand'
import type { BrandKit, Design, El, Page } from './types'
import { loadBrand, saveBrand } from './brand'

export const uid = () => Math.random().toString(36).slice(2, 10)
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/** Older designs kept one page's content at the top level. Convert them to pages. */
export function normalize(d: Design): Design {
  if (d.pages?.length) return d
  const { background, elements, ...rest } = d
  return { ...rest, pages: [{ id: uid(), background: background ?? '#ffffff', elements: elements ?? [] }] }
}

interface State {
  design: Design | null
  pageIndex: number
  selectedId: string | null
  past: Design[]
  future: Design[]
  brand: BrandKit
  open: (d: Design) => void
  close: () => void
  select: (id: string | null) => void
  selectPage: (i: number) => void
  addPage: () => void
  duplicatePage: (i: number) => void
  removePage: (i: number) => void
  movePage: (i: number, dir: -1 | 1) => void
  commit: () => void
  update: (id: string, patch: Partial<El>, snapshot?: boolean) => void
  add: (el: El) => void
  remove: (id: string) => void
  duplicate: (id: string) => void
  reorder: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
  setDesign: (patch: Partial<Design>, snapshot?: boolean) => void
  setPage: (patch: Partial<Page>, snapshot?: boolean) => void
  replaceAll: (patch: Pick<Design, 'width' | 'height' | 'pages'>) => void
  undo: () => void
  redo: () => void
  setBrand: (b: BrandKit) => void
}

export const useStore = create<State>((set, get) => {
  const withPage = (fn: (els: El[]) => El[], extra: Partial<State> = {}) => {
    const { design, pageIndex } = get()
    if (!design) return
    const pages = design.pages.map((p, i) => (i === pageIndex ? { ...p, elements: fn(p.elements) } : p))
    set({ design: { ...design, pages, updatedAt: Date.now() }, ...extra })
  }
  return {
    design: null,
    pageIndex: 0,
    selectedId: null,
    past: [],
    future: [],
    brand: loadBrand(),
    open: (d) => set({ design: normalize(clone(d)), pageIndex: 0, selectedId: null, past: [], future: [] }),
    close: () => set({ design: null, pageIndex: 0, selectedId: null, past: [], future: [] }),
    select: (id) => set({ selectedId: id }),
    selectPage: (i) => {
      const d = get().design
      if (d && i >= 0 && i < d.pages.length) set({ pageIndex: i, selectedId: null })
    },
    commit: () => {
      const d = get().design
      if (d) set((s) => ({ past: [...s.past.slice(-99), clone(d)], future: [] }))
    },
    addPage: () => {
      const { design, pageIndex } = get()
      if (!design) return
      get().commit()
      const pages = [...design.pages]
      pages.splice(pageIndex + 1, 0, { id: uid(), background: design.pages[pageIndex].background, elements: [] })
      set({ design: { ...design, pages, updatedAt: Date.now() }, pageIndex: pageIndex + 1, selectedId: null })
    },
    duplicatePage: (i) => {
      const { design } = get()
      if (!design) return
      get().commit()
      const src = clone(design.pages[i])
      const pages = [...design.pages]
      pages.splice(i + 1, 0, { ...src, id: uid(), elements: src.elements.map((e) => ({ ...e, id: uid() })) })
      set({ design: { ...design, pages, updatedAt: Date.now() }, pageIndex: i + 1, selectedId: null })
    },
    removePage: (i) => {
      const { design } = get()
      if (!design || design.pages.length < 2) return
      get().commit()
      const pages = design.pages.filter((_, k) => k !== i)
      set({ design: { ...design, pages, updatedAt: Date.now() }, pageIndex: Math.min(i, pages.length - 1), selectedId: null })
    },
    movePage: (i, dir) => {
      const { design } = get()
      const j = i + dir
      if (!design || j < 0 || j >= design.pages.length) return
      get().commit()
      const pages = [...design.pages]
      ;[pages[i], pages[j]] = [pages[j], pages[i]]
      set({ design: { ...design, pages, updatedAt: Date.now() }, pageIndex: j })
    },
    update: (id, patch, snapshot = true) => {
      if (!get().design) return
      if (snapshot) get().commit()
      withPage((els) => els.map((e) => (e.id === id ? ({ ...e, ...patch } as El) : e)))
    },
    add: (el) => {
      if (!get().design) return
      get().commit()
      withPage((els) => [...els, el], { selectedId: el.id })
    },
    remove: (id) => {
      if (!get().design) return
      get().commit()
      withPage((els) => els.filter((e) => e.id !== id), { selectedId: null })
    },
    duplicate: (id) => {
      const { design, pageIndex } = get()
      const el = design?.pages[pageIndex].elements.find((e) => e.id === id)
      if (el) get().add({ ...clone(el), id: uid(), x: el.x + 24, y: el.y + 24 })
    },
    reorder: (id, dir) => {
      if (!get().design) return
      get().commit()
      withPage((els) => {
        const a = [...els]
        const i = a.findIndex((e) => e.id === id)
        if (i < 0) return els
        const [el] = a.splice(i, 1)
        const j = dir === 'up' ? Math.min(i + 1, a.length) : dir === 'down' ? Math.max(i - 1, 0) : dir === 'top' ? a.length : 0
        a.splice(j, 0, el)
        return a
      })
    },
    setDesign: (patch, snapshot = true) => {
      const d = get().design
      if (!d) return
      if (snapshot) get().commit()
      set({ design: { ...d, ...patch, updatedAt: Date.now() } })
    },
    setPage: (patch, snapshot = true) => {
      const { design, pageIndex } = get()
      if (!design) return
      if (snapshot) get().commit()
      const pages = design.pages.map((p, i) => (i === pageIndex ? { ...p, ...patch } : p))
      set({ design: { ...design, pages, updatedAt: Date.now() } })
    },
    replaceAll: (patch) => {
      const d = get().design
      if (!d) return
      get().commit()
      set({ design: { ...d, ...patch, updatedAt: Date.now() }, pageIndex: 0, selectedId: null })
    },
    undo: () => {
      const { past, design, future, pageIndex } = get()
      if (!past.length || !design) return
      const prev = past[past.length - 1]
      set({ design: prev, past: past.slice(0, -1), future: [clone(design), ...future], selectedId: null, pageIndex: Math.min(pageIndex, prev.pages.length - 1) })
    },
    redo: () => {
      const { past, design, future, pageIndex } = get()
      if (!future.length || !design) return
      const next = future[0]
      set({ design: next, future: future.slice(1), past: [...past, clone(design)], selectedId: null, pageIndex: Math.min(pageIndex, next.pages.length - 1) })
    },
    setBrand: (b) => {
      saveBrand(b)
      set({ brand: b })
    },
  }
})
