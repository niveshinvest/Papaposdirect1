
-- PAPAPOS MIGRATION 080: STAFF SESSIONS UNIQUE INDEX
-- Target: Supabase / Postgres
-- Context: Fixing "Handshake degraded" caused by missing unique index for ON CONFLICT in pos_terminal_handshake.

-- 1. CREATE UNIQUE INDEX FOR SESSION REBINDING
-- This index is required by the ON CONFLICT (user_id, terminal_id) WHERE status = 'active' clause
-- used in the pos_terminal_handshake RPC.
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_sessions_active_user_terminal 
ON public.staff_sessions (user_id, terminal_id) 
WHERE (status = 'active');

-- 2. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (80, 'staff_sessions_unique_index_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
