import { createClient } from '@supabase/supabase-js'

// Disable session persistence and auto token refresh in development to avoid
// navigator.lock related warnings and races caused by React Strict Mode remounts.
// If you need persistent sessions in production, adjust these options accordingly.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		detectSessionInUrl: false,
		persistSession: false,
		autoRefreshToken: false
	}
})
