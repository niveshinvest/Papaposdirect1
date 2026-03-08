
-- PAPAPOS MIGRATION 058: STAFF SESSION IDENTITY LINKING
-- Target: Supabase / Postgres
-- Context: Fixing "Could not find a relationship between 'staff_sessions' and 'profiles'"

-- 1. VERIFY AND CLEANUP
-- Ensure we don't have duplicate constraints or broken links
ALTER TABLE public.staff_sessions DROP CONSTRAINT IF EXISTS staff_sessions_user_id_profiles_fkey;

-- 2. CREATE EXPLICIT RELATIONSHIP
-- This allows select=*,profiles(*) via the REST API.
-- Profiles table uses 'id' as PK which maps 1:1 to auth.users.id.
ALTER TABLE public.staff_sessions
ADD CONSTRAINT staff_sessions_user_id_profiles_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- 3. REFRESH POSTGREST CACHE
-- Critical: This tells Supabase to re-scan the table relationships
NOTIFY pgrst, 'reload schema';

-- 4. RLS VALIDATION (NON-DESTRUCTIVE)
-- Ensure 'Session Visibility' policy allows joins
-- Existing policy from Mig 040:
-- USING (company_id = public.get_my_company_id())
-- This is sufficient as it restricts rows at the source table.

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (58, 'staff_sessions_profiles_fk_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
