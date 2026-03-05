
-- PAPAPOS MIGRATION 071: INVENTORY MASTER PRO
-- Target: Supabase / Postgres
-- Description: Enhances the base inventory table for professional SKU management.

BEGIN;

-- 1. SCHEMA ENHANCEMENT
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS preferred_vendor TEXT,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_level NUMERIC(12,4) DEFAULT 0;

-- 2. DATA SYNCHRONIZATION (Backward Compatibility)
-- Sync legacy camelCase columns to new snake_case columns if they have data
UPDATE public.inventory 
SET 
    cost_price = COALESCE(cost_price, "costPrice", 0),
    min_level = COALESCE(min_level, "minStockLevel", 0)
WHERE cost_price = 0 OR min_level = 0;

-- 3. RLS REINFORCEMENT
-- Ensure RLS is enabled (should be from Migration 031, but let's be safe)
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Hardened policy for inventory management
DROP POLICY IF EXISTS "Strict Tenant Isolation" ON public.inventory;
CREATE POLICY "Strict Tenant Isolation"
ON public.inventory
FOR ALL
TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- 4. INDEXING
CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_vendor ON public.inventory(preferred_vendor);

-- 5. VERSION RECORDING
INSERT INTO public.schema_migrations (version, name) 
VALUES (71, 'inventory_master_pro_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
