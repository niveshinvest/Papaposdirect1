
import { createClient } from '@supabase/supabase-js';

// Centralized Supabase Client Configuration
// This is the single source of truth for the cloud connection.
// Fix: Added exports for URL and KEY so they can be used for initial local DB configuration
export const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || 'https://grcewyvwjllhzmdbaova.supabase.co';
export const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xjCGBzJboB1fozNos563ig_GUUDL0T1';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
