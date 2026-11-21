import { createClient } from '@supabase/supabase-js'
import type { Design } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase = url && key ? createClient(url, key) : null
export const cloudEnabled = !!supabase

const LS = 'studio.designs'
const readLocal = (): Design[] => {
  try { return JSON.parse(localStorage.getItem(LS) || '[]') } catch { return [] }
}
const writeLocal = (ds: Design[]): boolean => {
  try { localStorage.setItem(LS, JSON.stringify(ds)); return true } catch { return false }
}

async function userId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

const BUCKET = 'design-images'
const uploaded = new Map<string, string>() // data URL -> public URL (this session)

function dataUrlToBlob(u: string): Blob {
  const [head, b64] = u.split(',')
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// Move any embedded pictures into storage and swap in their links, so the saved design stays tiny.
async function moveImagesToStorage(d: Design, uid: string): Promise<Design> {
  const els = await Promise.all(
    d.elements.map(async (e) => {
      const patch = async (src: string | undefined) => {
        if (!src || !src.startsWith('data:')) return src
        const hit = uploaded.get(src)
        if (hit) return hit
        const blob = dataUrlToBlob(src)
        const ext = blob.type.split('/')[1]?.split('+')[0] || 'png'
        const path = `${uid}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase!.storage.from(BUCKET).upload(path, blob, { contentType: blob.type })
        if (error) throw error
        const url = supabase!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
        uploaded.set(src, url)
        return url
      }
      if (e.type !== 'image') return e
      return { ...e, src: (await patch(e.src))!, original: await patch(e.original) }
    }),
  )
  return { ...d, elements: els }
}

export async function listDesigns(): Promise<Design[]> {
  if (supabase && (await userId())) {
    // names and sizes only; full designs load when opened
    const { data } = await supabase.from('designs').select('id,name,updated_at,w:data->width,h:data->height').order('updated_at', { ascending: false })
    if (data) {
      return data.map((r) => ({
        id: r.id as string, name: r.name as string, width: Number(r.w) || 0, height: Number(r.h) || 0, background: '#ffffff', elements: [], updatedAt: new Date(r.updated_at as string).getTime(),
      }))
    }
  }
  return readLocal().sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getDesign(id: string): Promise<Design | null> {
  if (supabase && (await userId())) {
    const { data } = await supabase.from('designs').select('data').eq('id', id).maybeSingle()
    if (data) return data.data as Design
  }
  return readLocal().find((x) => x.id === id) ?? null
}

export async function saveDesign(d: Design) {
  const uid = supabase ? await userId() : null
  let toSave = d
  if (uid) {
    try {
      toSave = await moveImagesToStorage(d, uid)
    } catch (e) {
      console.error(e)
      alert('Could not upload a picture: ' + (e as Error).message)
      return
    }
  }
  // keep a small local copy; if the browser is full, keep just this design
  const others = readLocal().filter((x) => x.id !== d.id)
  let localOk = writeLocal([toSave, ...others])
  if (!localOk) localOk = writeLocal([toSave])
  if (uid) {
    const { error } = await supabase!.from('designs').upsert({ id: d.id, name: d.name, data: toSave, updated_at: new Date(d.updatedAt).toISOString() })
    if (error) { console.error(error); alert('Could not save: ' + error.message) }
  } else if (!localOk) {
    alert('Your browser has no room left to save this design. Sign in to save it online, or use a smaller image.')
  }
}

export async function deleteDesign(id: string) {
  writeLocal(readLocal().filter((x) => x.id !== id))
  if (supabase && (await userId())) await supabase.from('designs').delete().eq('id', id)
}
