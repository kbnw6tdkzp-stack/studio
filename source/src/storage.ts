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
const writeLocal = (ds: Design[]) => {
  try { localStorage.setItem(LS, JSON.stringify(ds)) } catch { alert('Browser storage is full. Remove some designs or images.') }
}

async function userId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export async function listDesigns(): Promise<Design[]> {
  const local = readLocal()
  if (supabase && (await userId())) {
    const { data } = await supabase.from('designs').select('data').order('updated_at', { ascending: false })
    if (data) return data.map((r) => r.data as Design)
  }
  return local.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveDesign(d: Design) {
  const ds = readLocal().filter((x) => x.id !== d.id)
  writeLocal([d, ...ds]) // always keep a local copy
  if (supabase && (await userId())) {
    await supabase.from('designs').upsert({ id: d.id, name: d.name, data: d, updated_at: new Date(d.updatedAt).toISOString() })
  }
}

export async function deleteDesign(id: string) {
  writeLocal(readLocal().filter((x) => x.id !== id))
  if (supabase && (await userId())) await supabase.from('designs').delete().eq('id', id)
}
