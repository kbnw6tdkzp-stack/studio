import { useEffect, useState, useSyncExternalStore } from 'react'
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
