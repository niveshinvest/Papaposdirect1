
-- PAPAPOS MIGRATION 069: RESTORE MANUAL RECIPES
-- Target: Supabase / Postgres
-- Description: Adds 'source' column to 'recipes' table and enforces constraints.

-- 1. Add source column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='source') THEN
        ALTER TABLE public.recipes ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL';
    END IF;
END $$;

-- 1.5 Add missing columns if they don't exist (Fix for migration 068 skip)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='ai_prompt') THEN
        ALTER TABLE public.recipes ADD COLUMN ai_prompt TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='status') THEN
        ALTER TABLE public.recipes ADD COLUMN status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'QUEUED', 'FINALIZED', 'REJECTED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='created_at') THEN
        ALTER TABLE public.recipes ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='updated_at') THEN
        ALTER TABLE public.recipes ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='created_by') THEN
        ALTER TABLE public.recipes ADD COLUMN created_by UUID;
    END IF;
END $$;

-- 2. Add constraint for source
ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS recipes_source_check;
ALTER TABLE public.recipes ADD CONSTRAINT recipes_source_check CHECK (source IN ('AI', 'MANUAL'));

-- 3. Update existing recipes to 'AI' if they have an ai_prompt
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='ai_prompt') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='source') THEN
        EXECUTE 'UPDATE public.recipes SET source = ''AI'' WHERE ai_prompt IS NOT NULL';
    END IF;
END $$;

-- 4. Record Version
INSERT INTO public.schema_migrations (version, name) 
VALUES (69, 'restore_manual_recipes')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
