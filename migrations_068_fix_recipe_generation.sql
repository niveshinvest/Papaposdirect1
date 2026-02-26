
-- PAPAPOS MIGRATION 068: FIX RECIPE GENERATION
-- Target: Supabase / Postgres
-- Description: Creates the 'recipes' table with strict status workflow.

BEGIN;

-- 1. Create the recipes table
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    recipe_json JSONB NOT NULL,
    ai_prompt TEXT,
    status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'QUEUED', 'FINALIZED', 'REJECTED')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Security (RLS)
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- Policy: Strict Tenant Isolation
DROP POLICY IF EXISTS "Recipes Tenant Isolation" ON public.recipes;
CREATE POLICY "Recipes Tenant Isolation" 
ON public.recipes
FOR ALL
TO authenticated
USING (
    company_id = public.get_my_company_id()
)
WITH CHECK (
    company_id = public.get_my_company_id()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_recipes_outlet ON public.recipes(outlet_id);
CREATE INDEX IF NOT EXISTS idx_recipes_company ON public.recipes(company_id);
CREATE INDEX IF NOT EXISTS idx_recipes_status ON public.recipes(status);

-- 4. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_recipes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_update_recipes_updated_at ON public.recipes;
CREATE TRIGGER tr_update_recipes_updated_at
    BEFORE UPDATE ON public.recipes
    FOR EACH ROW
    EXECUTE PROCEDURE update_recipes_updated_at();

-- 5. Record Version
INSERT INTO public.schema_migrations (version, name) 
VALUES (68, 'fix_recipe_generation')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
