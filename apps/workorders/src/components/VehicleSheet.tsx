import { useState } from 'react'
import { Field, Sheet } from './ui'
import { checkVin, decodeVin } from '../lib/vin'
import { saveVehicle } from '../lib/repo'
import type { Vehicle } from '../lib/types'

export function VehicleSheet({ vehicle, onClose, onSaved }: { vehicle: Vehicle; onClose: () => void; onSaved?: (v: Vehicle) => void }) {
  const [v, setV] = useState<Vehicle>(vehicle)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({})
  const set = (patch: Partial<Vehicle>) => setV((x) => ({ ...x, ...patch }))

  const lookup = async () => {
    const c = checkVin(v.vin)
    set({ vin: c.vin })
    if (!c.ok) { setMsg({ error: c.message }); return }
    if (!navigator.onLine) { setMsg({ info: 'No signal right now. The VIN is saved; tap Look up again when you’re back online.' }); return }
    setBusy(true); setMsg({})
    try {
      const d = await decodeVin(c.vin)
      setV((x) => ({ ...x, vin: c.vin, year: d.year || x.year, make: d.make || x.make, model: d.model || x.model,
        trim: d.trim || x.trim, engine: d.engine || x.engine, details: { ...x.details, ...d.details } }))
      setMsg({ info: c.message || 'Vehicle details filled in from the VIN.' })
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(false) }
  }

  const save = async () => { await saveVehicle(v); onSaved?.(v); onClose() }

  return (
    <Sheet title={vehicle.make ? 'Edit vehicle' : 'Add vehicle'} onClose={onClose}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Field label="VIN" value={v.vin} onChange={(vin) => set({ vin: vin.toUpperCase() })} placeholder="17 characters"
            hint="Door jamb sticker, dash at the windshield, or registration." />
        </div>
        <button className="secondary" onClick={lookup} disabled={busy || !v.vin} style={{ marginBottom: 22 }}>{busy ? 'Looking up…' : 'Look up'}</button>
      </div>
      {msg.error && <p className="error">{msg.error}</p>}
      {msg.info && <p className="banner">{msg.info}</p>}
      <div className="grid3">
        <Field label="Year" value={v.year} onChange={(year) => set({ year })} inputMode="numeric" />
        <Field label="Make" value={v.make} onChange={(make) => set({ make })} />
        <Field label="Model" value={v.model} onChange={(model) => set({ model })} />
        <Field label="Trim" value={v.trim} onChange={(trim) => set({ trim })} />
        <Field label="Engine" value={v.engine} onChange={(engine) => set({ engine })} />
        <Field label="Color" value={v.color} onChange={(color) => set({ color })} />
        <Field label="Plate" value={v.plate} onChange={(plate) => set({ plate: plate.toUpperCase() })} />
        <Field label="Mileage" value={v.mileage} onChange={(mileage) => set({ mileage })} inputMode="numeric" />
      </div>
      {Object.keys(v.details).length > 0 && (
        <p className="small muted">{Object.entries(v.details).map(([k, val]) => `${k}: ${val}`).join(' · ')}</p>
      )}
      <div className="row">
        <button className="block" onClick={save}>Save vehicle</button>
      </div>
      {vehicle.make && (
        <button className="danger" onClick={async () => { await saveVehicle({ ...v, deleted_at: new Date().toISOString() }); onClose() }}>
          Remove vehicle
        </button>
      )}
    </Sheet>
  )
}
