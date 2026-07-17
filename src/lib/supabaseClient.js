import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase non configurato: imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nel file .env'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
