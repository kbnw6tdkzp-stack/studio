import { supabase } from './supabase'
export const logoUrl = (path: string | null | undefined) =>
  path ? supabase.storage.from('logos').getPublicUrl(path).data.publicUrl : null
