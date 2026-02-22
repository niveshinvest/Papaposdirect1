
-- PAPAPOS MIGRATION 020: FIX COMPANY CREATION RLS
-- Target: Supabase / Postgres
-- Description: Allows authenticated users to create their first company record.

BEGIN;

-- 1. Ensure RLS enabled
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Clear out any restrictive or conflicting INSERT policies
DROP POLICY IF EXISTS "companies_insert_policy" ON public.companies;
DROP POLICY IF EXISTS "Allow insert with company_id" ON public.companies;
DROP POLICY IF EXISTS "Allow authenticated users to create company" ON public.companies;

-- 3. CREATE explicit INSERT policy for authenticated users
-- This allows the 'createCompany' step in authService to succeed.
CREATE POLICY "Allow authenticated users to create company"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 4. Update SELECT policy to ensure visibility for the creator (owner_id)
DROP POLICY IF EXISTS "Users can see their own company" ON public.companies;
CREATE POLICY "Users can see their own company" ON public.companies
    FOR SELECT 
    TO authenticated
    USING (
        owner_id = auth.uid() 
        OR 
        id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    );

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (20, 'fix_company_creation_rls_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
