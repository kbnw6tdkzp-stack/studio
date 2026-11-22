import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
import { subscribeSync, type SyncState } from './sync'

/** Re-renders whenever the local data the query reads changes (on this device or from a sync). */
export function useLive<T>(query: () => Promise<T> | T, deps: unknown[], initial?: T): T | undefined {
  const [value, setValue] = useState<T | undefined>(initial)
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error(e) })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}

let syncState: SyncState | null = null
const syncSubs = new Set<() => void>()
subscribeSync((s) => { syncState = s; syncSubs.forEach((f) => f()) })
export const useSyncState = () =>
  useSyncExternalStore((cb) => { syncSubs.add(cb); return () => { syncSubs.delete(cb) } }, () => syncState!)

export function useRoute(): string[] {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const f = () => setHash(location.hash)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean)
}
export const go = (path: string) => { location.hash = path }

/**
 * Local editable copy of a saved record. Your typing always wins: fresh data from
 * the device (e.g. after a sync) is only taken when every edit you made has been saved.
 * Edits are saved after a short pause, and immediately when you leave the screen.
 */
export function useDraft<T>(source: T | null | undefined, save: (v: T) => Promise<unknown>, delay = 400) {
  const [draft, setDraft] = useState<T | null>(null)
  const ver = useRef(0)
  const saved = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef<T | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => { if (source && ver.current === saved.current) { setDraft(source); latest.current = source } }, [source])
  useEffect(() => () => {
    clearTimeout(timer.current)
    if (ver.current !== saved.current && latest.current) void saveRef.current(latest.current)
  }, [])

  const update = (next: T, now = false) => {
    setDraft(next)
    latest.current = next
    const v = ++ver.current
    clearTimeout(timer.current)
    const run = async () => { await saveRef.current(next); if (saved.current < v) saved.current = v }
    if (now) void run(); else timer.current = setTimeout(run, delay)
  }
  return [draft, update] as const
}
