
-- PAPAPOS REPAIR MIGRATION 031: INVENTORY TENANT ISOLATION
-- Target: Supabase / Postgres
-- Reason: Fix missing company_id and outlet_id columns in the base 'inventory' table to enable strict RLS.

BEGIN;

-- ==========================================
-- 1. SCHEMA ALIGNMENT
-- ==========================================

-- Table: public.inventory
-- Column: company_id (UUID)
-- Reason: Required for global tenant isolation across the platform.
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Table: public.inventory
-- Column: outlet_id (TEXT)
-- Reason: Required for branch-level stock tracking. Linked to outlets(id) which is TEXT in Migration 002.
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);


-- ==========================================
-- 2. DATA BACKFILL (SAFE RECOVERY)
-- ==========================================

-- Step A: Sync identity from 'outlets' table using the legacy 'outletId' column.
UPDATE public.inventory i
SET 
    company_id = o.company_id,
    outlet_id = o.id
FROM public.outlets o
WHERE (i."outletId" = o.id OR i.outlet_id = o.id)
AND (i.company_id IS NULL OR i.outlet_id IS NULL);

-- Step B: Safe fallback for orphans (Link to the first company found if still null).
-- This prevents the NOT NULL constraint from failing on production data without context.
UPDATE public.inventory 
SET company_id = (SELECT id FROM public.companies LIMIT 1)
WHERE company_id IS NULL;


-- ==========================================
-- 3. CONSTRAINT ENFORCEMENT
-- ==========================================

-- Ensure every inventory record MUST belong to a company.
-- We only apply this if a company actually exists to avoid locking out fresh installs.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM public.companies) THEN
        ALTER TABLE public.inventory ALTER COLUMN company_id SET NOT NULL;
    END IF;
END $$;


-- ==========================================
-- 4. SECURITY HARDENING (RLS)
-- ==========================================

-- Enable Row Level Security
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Remove legacy permissive policies
DROP POLICY IF EXISTS "Public Access" ON public.inventory;
DROP POLICY IF EXISTS "Public Access Inventory" ON public.inventory;
DROP POLICY IF EXISTS "Outlet Isolation" ON public.inventory;
DROP POLICY IF EXISTS "Strict Tenant Isolation" ON public.inventory;

-- Create hardened multi-tenant isolation policy.
-- Uses public.get_my_company_id() helper (Security Definer) to avoid circular RLS dependencies.
CREATE POLICY "Strict Tenant Isolation"
ON public.inventory
FOR ALL
TO authenticated
USING (company_id = public.get_my_company_id())
WITH CHECK (company_id = public.get_my_company_id());


-- ==========================================
-- 5. PERFORMANCE OPTIMIZATION
-- ==========================================

-- Index the tenant columns for high-speed lookups and join performance.
CREATE INDEX IF NOT EXISTS idx_inventory_tenant_repair ON public.inventory(company_id, outlet_id);


-- ==========================================
-- 6. VERSION RECORDING
-- ==========================================
INSERT INTO public.schema_migrations (version, name) 
VALUES (31, 'inventory_tenant_repair_v2')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
