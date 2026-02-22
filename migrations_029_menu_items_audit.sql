
-- PAPAPOS MIGRATION 029: MENU ITEMS AUDIT & IDENTITY
-- Target: Supabase / Postgres

BEGIN;

-- 1. ADD AUDIT COLUMNS
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

-- 2. BACKFILL (Set created_by to company owner if unknown)
UPDATE public.menu_items mi
SET created_by = c.owner_id
FROM public.companies c
WHERE mi.company_id = c.id AND mi.created_by IS NULL;

-- 3. HARDEN RLS
-- Ensure we use the security definer helper to avoid recursion
DROP POLICY IF EXISTS "Outlet Isolation" ON public.menu_items;
CREATE POLICY "Outlet Isolation" 
ON public.menu_items 
FOR ALL 
TO authenticated 
USING (company_id = public.get_my_company_id()) 
WITH CHECK (company_id = public.get_my_company_id());

-- 4. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (29, 'menu_items_audit_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
