
-- PAPAPOS MIGRATION 023: FIX OUTLET RLS POLICIES
-- Target: Supabase / Postgres
-- Description: Corrects the multi-tenant isolation for outlets.

BEGIN;

-- 1. Update Outlets Policy
DROP POLICY IF EXISTS "Tenant Access Outlets" ON public.outlets;
CREATE POLICY "Tenant Access Outlets" ON public.outlets
    FOR ALL 
    TO authenticated
    USING (company_id = public.get_my_company_id())
    WITH CHECK (company_id = public.get_my_company_id());

-- 2. Update Outlet GST Policy
DROP POLICY IF EXISTS "Tenant Access Outlet GST" ON public.outlet_gst;
CREATE POLICY "Tenant Access Outlet GST" ON public.outlet_gst
    FOR ALL 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.outlets 
            WHERE outlets.id = outlet_gst.outlet_id 
            AND outlets.company_id = public.get_my_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.outlets 
            WHERE outlets.id = outlet_gst.outlet_id 
            AND outlets.company_id = public.get_my_company_id()
        )
    );

-- 3. Record Version
INSERT INTO public.schema_migrations (version, name) 
VALUES (23, 'fix_outlet_rls_v2')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
