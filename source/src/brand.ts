import type { BrandKit } from './types'
import logo from './assets/logo.svg?inline'

// Index meaning used by templates: 0 primary, 1 accent, 2 dark text, 3 light background.
export const DEFAULT_BRAND: BrandKit = {
  name: 'studio',
  tagline: 'Design that feels natural',
  colors: ['#5f7f62', '#d2b48c', '#2f3a30', '#f6f1e7', '#a8c3a0', '#e6dcc6'],
  fonts: ['Inter', 'Georgia', 'Trebuchet MS', 'Courier New'],
  logo,
}

const KEY = 'studio.brand.v2'
export function loadBrand(): BrandKit {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_BRAND, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_BRAND
}
export function saveBrand(b: BrandKit) {
  try { localStorage.setItem(KEY, JSON.stringify(b)) } catch { /* ignore */ }
}
