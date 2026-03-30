
import { createClient } from '@supabase/supabase-js';

// Centralized Supabase Client Configuration
// This is the single source of truth for the cloud connection.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://grcewyvwjllhzmdbaova.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xjCGBzJboB1fozNos563ig_GUUDL0T1';

// Validate URL format to prevent early fetch errors
const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

if (!isValidUrl(SUPABASE_URL)) {
  console.error("Invalid SUPABASE_URL detected. Please check your environment variables.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },

  
  global: {
    headers: { 'x-application-name': 'papapos' }
  }

  
});
if (typeof window !== "undefined") {
  (window as any).supabase = supabase;
}
