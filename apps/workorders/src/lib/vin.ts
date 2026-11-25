// VIN check: 17 characters, no I/O/Q, and the 9th character is a check digit
// (North American VINs). Decoding uses NHTSA's free vPIC service.

const VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
  P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

export const cleanVin = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IOQ]/g, (c) => (c === 'I' ? '1' : '0'))

export function checkVin(raw: string): { ok: boolean; vin: string; message: string } {
  const vin = cleanVin(raw)
  if (vin.length !== 17) return { ok: false, vin, message: `A VIN has 17 characters (this has ${vin.length}).` }
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const c = vin[i]
    const v = /\d/.test(c) ? Number(c) : VALUES[c]
    if (v === undefined) return { ok: false, vin, message: `"${c}" isn't allowed in a VIN.` }
    sum += v * WEIGHTS[i]
  }
  const check = sum % 11 === 10 ? 'X' : String(sum % 11)
  if (vin[8] !== check) return { ok: true, vin, message: 'Check digit doesn’t match. Double-check the VIN (some imports skip it).' }
  return { ok: true, vin, message: '' }
}

export interface Decoded { year: string; make: string; model: string; trim: string; engine: string; details: Record<string, string> }

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())

export async function decodeVin(vin: string): Promise<Decoded> {
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`)
  if (!res.ok) throw new Error('VIN lookup failed. Try again when you have signal.')
  const json = await res.json()
  const r = json?.Results?.[0] ?? {}
  const g = (k: string) => (typeof r[k] === 'string' ? r[k].trim() : '')
  if (!g('Make')) throw new Error(g('ErrorText') || 'No vehicle found for that VIN.')
  const liters = g('DisplacementL') ? `${Number(g('DisplacementL')).toFixed(1)}L` : ''
  const cyl = g('EngineCylinders') ? `${g('EngineCylinders')} cyl` : ''
  const fuel = g('FuelTypePrimary') && g('FuelTypePrimary') !== 'Gasoline' ? g('FuelTypePrimary') : ''
  const engine = [liters, cyl, fuel, g('EngineModel')].filter(Boolean).join(' ')
  const details: Record<string, string> = {}
  for (const [k, label] of [
    ['BodyClass', 'Body'], ['DriveType', 'Drive'], ['TransmissionStyle', 'Transmission'],
    ['Doors', 'Doors'], ['PlantCountry', 'Built in'], ['Series', 'Series'],
  ] as const) if (g(k)) details[label] = g(k)
  return {
    year: g('ModelYear'),
    make: titleCase(g('Make')),
    model: g('Model'),
    trim: g('Trim') || g('Series'),
    engine,
    details,
  }
}

/**
 * Pull a VIN out of whatever a barcode contains. Door-jamb Code 39 labels often add a
 * leading "I" (import marker); windshield and registration codes can hold other text too.
 * Prefers a candidate whose check digit is valid.
 */
export function extractVin(raw: string): string | null {
  const text = raw.toUpperCase().replace(/[^A-Z0-9]/g, ' ')
  const candidates: string[] = []
  for (const word of text.split(/\s+/)) {
    if (word.length === 17) candidates.push(word)
    else if (word.length === 18 && word.startsWith('I')) candidates.push(word.slice(1))
    else if (word.length > 17) for (let i = 0; i + 17 <= word.length; i++) candidates.push(word.slice(i, i + 17))
  }
  const valid = candidates.filter((c) => !/[IOQ]/.test(c))
  const perfect = valid.find((c) => { const r = checkVin(c); return r.ok && r.message === '' })
  return perfect ?? (valid.length === 1 ? valid[0] : null)
}
