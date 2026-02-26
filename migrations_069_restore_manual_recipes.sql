
-- PAPAPOS MIGRATION 069: RESTORE MANUAL RECIPES
-- Target: Supabase / Postgres
-- Description: Adds 'source' column to 'recipes' table and enforces constraints.

BEGIN;

-- 1. Add source column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='source') THEN
        ALTER TABLE public.recipes ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL';
    END IF;
END $$;

-- 2. Add constraint for source
ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS recipes_source_check;
ALTER TABLE public.recipes ADD CONSTRAINT recipes_source_check CHECK (source IN ('AI', 'MANUAL'));

-- 3. Update existing recipes to 'AI' if they have an ai_prompt
UPDATE public.recipes SET source = 'AI' WHERE ai_prompt IS NOT NULL;

-- 4. Record Version
INSERT INTO public.schema_migrations (version, name) 
VALUES (69, 'restore_manual_recipes')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
