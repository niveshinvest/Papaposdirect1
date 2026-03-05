
-- PAPAPOS MIGRATION 072: INVENTORY MATCHING & ALIASES
-- Target: Supabase / Postgres
-- Description: Adds alias support and matching metadata for AI procurement.

BEGIN;

-- 1. INVENTORY ALIASES
CREATE TABLE IF NOT EXISTS public.inventory_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    inventory_id TEXT NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, alias_name)
);

-- 2. RLS FOR ALIASES
ALTER TABLE public.inventory_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aliases visibility" 
ON public.inventory_aliases FOR SELECT 
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Management manage aliases" 
ON public.inventory_aliases FOR ALL 
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- 3. INDEXING
CREATE INDEX IF NOT EXISTS idx_inventory_alias_name ON public.inventory_aliases(alias_name);

-- 4. VERSION RECORDING
INSERT INTO public.schema_migrations (version, name) 
VALUES (72, 'inventory_matching_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
