
-- PAPAPOS MIGRATION 060: MENU MODIFIERS
-- Target: Supabase / Postgres

-- 1. ADD MODIFIERS COLUMN TO MENU ITEMS
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]';

-- 2. UPDATE RLS (Already handled by Management manage items policy, but ensuring it)
-- No changes needed if using existing policies.

-- 3. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (60, 'menu_modifiers_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
