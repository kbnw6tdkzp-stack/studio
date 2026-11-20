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

export async function listDesigns(): Promise<Design[]> {
  const local = readLocal()
  if (supabase && (await userId())) {
    const { data } = await supabase.from('designs').select('data').order('updated_at', { ascending: false })
    if (data) return data.map((r) => r.data as Design)
  }
  return local.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveDesign(d: Design) {
  const signedIn = !!(supabase && (await userId()))
  // keep a local copy; if the browser is full, keep just this design, then skip quietly when the cloud has it
  const others = readLocal().filter((x) => x.id !== d.id)
  let localOk = writeLocal([d, ...others])
  if (!localOk) localOk = writeLocal([d])
  if (signedIn) {
    const { error } = await supabase!.from('designs').upsert({ id: d.id, name: d.name, data: d, updated_at: new Date(d.updatedAt).toISOString() })
    if (error) { console.error(error); if (!localOk) alert('Could not save: ' + error.message) }
  } else if (!localOk) {
    alert('Your browser has no room left to save this design. Sign in to save it online, or use a smaller image.')
  }
}

export async function deleteDesign(id: string) {
  writeLocal(readLocal().filter((x) => x.id !== id))
  if (supabase && (await userId())) await supabase.from('designs').delete().eq('id', id)
}
