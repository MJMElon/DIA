import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// These two values are PUBLIC by design (the anon key only grants what your
// auth + RLS allow). The Gemini key is NOT here — it lives server-side in the
// `count` Edge Function as a secret. If the envs are missing we still create a
// client so the app renders a helpful "not configured" message.
export const supabaseReady = Boolean(url && anon)
export const supabase = supabaseReady
  ? createClient(url, anon)
  : null
