
-- PAPAPOS MIGRATION 030: MENU SCHEMA REFINEMENT
-- Target: Supabase / Postgres
-- Purpose: Enforce outlet isolation for categories and mandatory links for items.

BEGIN;

-- 1. CLEANUP & ALIGNMENT FOR MENU CATEGORIES
-- Add outlet_id if missing (Note: outlets.id is TEXT in our schema)
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);

-- Backfill outlet_id for orphaned categories using company context
UPDATE public.menu_categories mc
SET outlet_id = (SELECT id FROM public.outlets WHERE company_id = mc.company_id LIMIT 1)
WHERE outlet_id IS NULL;

-- Enforce NOT NULL now that data is backfilled
ALTER TABLE public.menu_categories ALTER COLUMN outlet_id SET NOT NULL;

-- 2. ENFORCE ITEM-CATEGORY INTEGRITY
-- Ensure category_id is linked to the correct table
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_category_id_fkey;
ALTER TABLE public.menu_items 
    ADD CONSTRAINT menu_items_category_id_fkey 
    FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE SET NULL;

-- 3. HARDEN RLS FOR CATEGORIES
-- Use security helper public.get_my_company_id() to break recursion
DROP POLICY IF EXISTS "Menu categories visibility" ON public.menu_categories;
DROP POLICY IF EXISTS "Management manage categories" ON public.menu_categories;

CREATE POLICY "Outlet Isolation Categories" 
ON public.menu_categories 
FOR ALL 
TO authenticated 
USING (company_id = public.get_my_company_id()) 
WITH CHECK (company_id = public.get_my_company_id());

-- 4. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (30, 'menu_category_outlet_isolation_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
