
-- PAPAPOS MIGRATION 021: FIX PROFILE RLS
-- Target: Supabase / Postgres
-- Description: Allows users to manage their own profile record, essential for linking to a company.

BEGIN;

-- 1. Ensure RLS enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Allow users to see their own profile (and others in their company)
DROP POLICY IF EXISTS "Company wide profile visibility" ON public.profiles;
DROP POLICY IF EXISTS "Users can see own profile" ON public.profiles;
CREATE POLICY "Users can see own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    id = auth.uid() 
    OR 
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

-- 3. Allow users to create their own profile record (client-side fallback if trigger fails)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- 4. Allow users to update their own profile (CRITICAL for Identity Linking)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (21, 'fix_profile_management_rls_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
