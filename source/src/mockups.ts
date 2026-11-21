import builtinBlackBack from './assets/mockup-washed-black-back.jpg'

export interface Place { cx: number; top: number; width: number } // fractions of the photo
export interface PhotoMock { id: string; name: string; src: string; place: Place; builtin?: boolean }

export const BUILTIN_MOCKS: PhotoMock[] = [
  // back print on a washed black tee: centred between the shoulder blades, a little below the collar
  { id: 'builtin-black-back', name: 'Washed black · back print', src: builtinBlackBack, place: { cx: 0.508, top: 0.215, width: 0.34 }, builtin: true },
]

const DB = 'studio-mockups'
const open = () =>
  new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('m', { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })

export async function listUserMocks(): Promise<PhotoMock[]> {
  try {
    const db = await open()
    return await new Promise((res, rej) => {
      const q = db.transaction('m').objectStore('m').getAll()
      q.onsuccess = () => res(q.result as PhotoMock[])
      q.onerror = () => rej(q.error)
    })
  } catch { return [] }
}
export async function saveUserMock(m: PhotoMock) {
  try {
    const db = await open()
    await new Promise<void>((res, rej) => { const t = db.transaction('m', 'readwrite'); t.objectStore('m').put(m); t.oncomplete = () => res(); t.onerror = () => rej(t.error) })
  } catch { /* storage may be unavailable (private window) */ }
}
export async function deleteUserMock(id: string) {
  try {
    const db = await open()
    await new Promise<void>((res, rej) => { const t = db.transaction('m', 'readwrite'); t.objectStore('m').delete(id); t.oncomplete = () => res(); t.onerror = () => rej(t.error) })
  } catch { /* ignore */ }
}

// where you last put the art on a built-in photo
const PKEY = 'studio.mockplace.'
export function loadPlace(m: PhotoMock): Place {
  try { const raw = localStorage.getItem(PKEY + m.id); if (raw) return { ...m.place, ...JSON.parse(raw) } } catch { /* ignore */ }
  return m.place
}
export function savePlace(m: PhotoMock, p: Place) {
  if (!m.builtin) { saveUserMock({ ...m, place: p }); return }
  try { localStorage.setItem(PKEY + m.id, JSON.stringify(p)) } catch { /* ignore */ }
}
