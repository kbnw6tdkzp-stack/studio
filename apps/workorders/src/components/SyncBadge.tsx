import { useSyncState } from '../lib/hooks'
import { syncNow } from '../lib/sync'

export function SyncBadge() {
  const s = useSyncState()
  const [cls, text] = !s.online
    ? ['off', s.pending ? `Offline · ${s.pending} to upload` : 'Offline · saved on this device']
    : s.error ? ['err', 'Sync problem · tap to retry']
    : s.syncing ? ['', 'Syncing…']
    : s.pending ? ['off', `${s.pending} waiting to upload`]
    : ['', 'Synced']
  return (
    <button className="ghost small sync" onClick={() => void syncNow()} title={s.error ?? ''}>
      <span className={`dot ${cls}`} />{text}
    </button>
  )
}
