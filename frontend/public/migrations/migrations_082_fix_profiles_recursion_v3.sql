
-- Migration 082: Final Fix for Profiles RLS Recursion
-- Description: Replaces all recursive profile policies and updates helper functions to use company_users.

-- 1. Update helper functions to use company_users (which doesn't depend on profiles)
-- This breaks the recursion loop because profiles policies no longer trigger queries to profiles via these functions.
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS uuid AS $$
  SELECT company_id FROM public.company_users WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_company_ids()
RETURNS SETOF UUID AS $$
  SELECT company_id FROM public.company_users WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Helper for management check
CREATE OR REPLACE FUNCTION public.is_company_management(target_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users 
    WHERE user_id = auth.uid() 
    AND company_id = target_company_id 
    AND role IN ('OWNER', 'MANAGER', 'ADMIN')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3. Clean up ALL known policies on profiles to ensure no legacy recursive ones remain
DROP POLICY IF EXISTS "Company wide profile visibility" ON public.profiles;
DROP POLICY IF EXISTS "Users can see own profile" ON public.profiles;
DROP POLICY IF EXISTS "Management manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles visibility" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert self" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update" ON public.profiles;
DROP POLICY IF EXISTS "Profiles delete" ON public.profiles;

-- 4. Create clean, non-recursive policies
-- SELECT: Users can see their own profile or any profile in their company
CREATE POLICY "Profiles visibility" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        id = auth.uid() 
        OR 
        company_id IN (SELECT public.get_my_company_ids())
    );

-- INSERT: Users can insert their own profile
CREATE POLICY "Profiles insert self" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

-- UPDATE: Users can update their own profile OR Management can update profiles in their company
CREATE POLICY "Profiles update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        id = auth.uid() 
        OR 
        public.is_company_management(company_id)
    )
    WITH CHECK (
        id = auth.uid() 
        OR 
        public.is_company_management(company_id)
    );

-- DELETE: Only owners/management can delete profiles in their company
CREATE POLICY "Profiles delete" ON public.profiles
    FOR DELETE TO authenticated
    USING (public.is_company_management(company_id));

-- 5. Record Migration
INSERT INTO public.schema_migrations (version, name) 
VALUES (82, 'fix_profiles_recursion_final_v3')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
