import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Email links (password reset, sign-up confirmation) come back with details after "#".
// Read them before the client consumes them, and tidy a link like "#/settings#access_token=…"
// (from older reset emails) so the sign-in details are still found.
function readAuthLink() {
  const raw = location.hash
  const at = raw.search(/(access_token|error)=/)
  if (at < 0) return { type: null as string | null, error: null as string | null }
  const params = new URLSearchParams(raw.slice(at))
  if (at > 1) history.replaceState(null, '', location.pathname + location.search + '#' + raw.slice(at))
  const error = params.get('error_description') ?? params.get('error')
  if (error) history.replaceState(null, '', location.pathname + location.search)
  return { type: params.get('type'), error: error ? error.replace(/\+/g, ' ') : null }
}
export const authLink = readAuthLink()

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
})
