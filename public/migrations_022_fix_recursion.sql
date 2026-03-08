
-- PAPAPOS MIGRATION 022: FIX RLS RECURSION
-- Target: Supabase / Postgres
-- Description: Resolves "infinite recursion detected" by using a security definer function.

-- 1. Create a helper function that bypasses RLS
-- This function runs as the owner (postgres), breaking the recursion loop.
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS uuid AS $$
BEGIN
  RETURN (SELECT company_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Drop the recursive policy
DROP POLICY IF EXISTS "Users can see own profile" ON public.profiles;

-- 3. Recreate the policy using the helper function
-- Now the sub-select is handled by the function without triggering RLS again.
CREATE POLICY "Users can see own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    id = auth.uid() 
    OR 
    company_id = public.get_my_company_id()
);

-- 4. Record Version
INSERT INTO public.schema_migrations (version, name) 
VALUES (22, 'fix_profiles_recursion_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
