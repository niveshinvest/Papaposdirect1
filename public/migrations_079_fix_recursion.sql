
-- Migration 079: Fix RLS Recursion
-- Description: Replaces recursive policies with non-recursive versions using security definer functions.

-- 1. Helper Functions (Security Definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.get_my_company_ids()
RETURNS SETOF UUID AS $$
  SELECT company_id FROM public.company_users WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_company_owner(target_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users 
    WHERE user_id = auth.uid() 
    AND company_id = target_company_id 
    AND role = 'OWNER'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Fix company_users policies
DROP POLICY IF EXISTS "Users can see their own company memberships" ON public.company_users;
CREATE POLICY "Users can see their own company memberships" ON public.company_users
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can manage company users" ON public.company_users;
CREATE POLICY "Owners can manage company users" ON public.company_users
    FOR ALL TO authenticated
    USING (public.is_company_owner(company_id));

-- 3. Fix profiles policies
DROP POLICY IF EXISTS "Company wide profile visibility" ON public.profiles;
CREATE POLICY "Company wide profile visibility" ON public.profiles
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT public.get_my_company_ids()));

-- 4. Fix outlets policies
DROP POLICY IF EXISTS "Company members can see their outlets" ON public.outlets;
CREATE POLICY "Company members can see their outlets" ON public.outlets
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT public.get_my_company_ids()));

-- 5. Fix outlet_users policies
DROP POLICY IF EXISTS "Owners can manage outlet users" ON public.outlet_users;
CREATE POLICY "Owners can manage outlet users" ON public.outlet_users
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.outlets o
            WHERE o.id = outlet_id
            AND public.is_company_owner(o.company_id)
        )
    );

-- 6. Record Migration
INSERT INTO public.schema_migrations (version, name) 
VALUES (79, 'fix_rls_recursion_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
