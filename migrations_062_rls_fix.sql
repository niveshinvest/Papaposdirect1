
-- PAPAPOS MIGRATION 062: RLS HARDENING FOR JOINS
-- Target: Supabase / Postgres
-- Description: Ensures menu_items, menu_categories, invoices, and staff can be joined correctly under RLS.

BEGIN;

-- 1. MENU CATEGORIES
DROP POLICY IF EXISTS "Menu categories visibility" ON public.menu_categories;
DROP POLICY IF EXISTS "Management manage categories" ON public.menu_categories;

CREATE POLICY "Menu categories visibility" ON public.menu_categories
    FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());

CREATE POLICY "Management manage categories" ON public.menu_categories
    FOR ALL TO authenticated USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());

-- 2. MENU ITEMS
DROP POLICY IF EXISTS "Menu items visibility" ON public.menu_items;
DROP POLICY IF EXISTS "Management manage items" ON public.menu_items;

CREATE POLICY "Menu items visibility" ON public.menu_items
    FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());

CREATE POLICY "Management manage items" ON public.menu_items
    FOR ALL TO authenticated USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());

-- 3. INVOICES
DROP POLICY IF EXISTS "Isolation" ON public.invoices;
CREATE POLICY "Isolation" ON public.invoices 
    FOR ALL TO authenticated USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());

-- 4. INVOICE ITEMS
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);

DROP POLICY IF EXISTS "Invoice items isolation" ON public.invoice_items;
CREATE POLICY "Invoice items isolation" ON public.invoice_items
    FOR ALL TO authenticated USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());

-- 5. PROFILES (STAFF)
-- Already handled in migration 022, but ensuring it covers ALL operations for management
DROP POLICY IF EXISTS "Management manage profiles" ON public.profiles;
CREATE POLICY "Management manage profiles" ON public.profiles
    FOR ALL TO authenticated USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());

-- 6. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (62, 'rls_hardening_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
