-- PAPAPOS MIGRATION 091: CATEGORY TAX & APPLY FLAGS
-- Target: Supabase / Postgres

-- 1. ADD TAX & FLAGS TO MENU CATEGORIES
ALTER TABLE public.menu_categories
ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC DEFAULT 5;

ALTER TABLE public.menu_categories
ADD COLUMN IF NOT EXISTS apply_tax_to_items BOOLEAN DEFAULT FALSE;

-- 2. ADD ITEM-LEVEL FLAG TO CONTROL INHERITING CATEGORY TAX
ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS apply_category_tax BOOLEAN DEFAULT TRUE;

-- 3. RECORD VERSION
INSERT INTO public.schema_migrations (version, name)
VALUES (91, 'category_tax_flags_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
