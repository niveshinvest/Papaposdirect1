
-- PAPAPOS MIGRATION 037: RECIPE WORKFLOW
-- Target: Supabase / Postgres

BEGIN;

-- 1. ADD STATUS COLUMN
ALTER TABLE public.recipes 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'manual' 
CHECK (status IN ('manual', 'ai_generated', 'approved'));

-- 2. BACKFILL EXISTING
UPDATE public.recipes SET status = 'manual' WHERE status IS NULL;

-- 3. ENSURE INDEX FOR FILTERING
CREATE INDEX IF NOT EXISTS idx_recipes_status ON public.recipes(status);

-- 4. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (37, 'recipe_workflow_status_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;