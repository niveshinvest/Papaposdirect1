
-- PAPAPOS MIGRATION 070: FIX RECIPE STATUS CONSTRAINT
-- Target: Supabase / Postgres
-- Description: Updates the status constraint to include DRAFT, QUEUED, FINALIZED, REJECTED.

BEGIN;

-- 1. Drop existing constraint if it exists
-- It might be named recipes_status_check (auto-named) or something else.
-- We try to drop it by name from the error message.
ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS recipes_status_check;

-- 2. Add the correct constraint
ALTER TABLE public.recipes ADD CONSTRAINT recipes_status_check 
CHECK (status IN ('DRAFT', 'QUEUED', 'FINALIZED', 'REJECTED'));

-- 3. Ensure existing data is compatible
-- Map old statuses to new ones if they exist
UPDATE public.recipes SET status = 'DRAFT' WHERE status NOT IN ('DRAFT', 'QUEUED', 'FINALIZED', 'REJECTED');

-- 4. Record Version
INSERT INTO public.schema_migrations (version, name) 
VALUES (70, 'fix_recipe_status_constraint')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
