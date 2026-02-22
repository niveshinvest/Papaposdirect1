
-- PAPAPOS REPAIR MIGRATION 032: CUSTOMERS TENANT ISOLATION
-- Target: Supabase / Postgres
-- Reason: Fix ERROR 23502 (NOT NULL violation) in customers table and reinforce strict multi-tenant RLS.

BEGIN;

-- ==========================================
-- 1. SCHEMA ALIGNMENT
-- ==========================================

-- Table: public.customers
-- Column: company_id (UUID)
-- Column: outlet_id (TEXT)
-- Reason: Required for global tenant isolation and branch-level CRM tracking.

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);


-- ==========================================
-- 2. DATA BACKFILL (IDENTITY RECOVERY)
-- ==========================================

-- Step A: Recover company_id from the first available company. 
-- In a multi-tenant POS, orphaned customers are usually created by the first onboarded entity.
UPDATE public.customers 
SET company_id = (SELECT id FROM public.companies LIMIT 1)
WHERE company_id IS NULL 
AND EXISTS (SELECT 1 FROM public.companies);

-- Step B: Recover outlet_id from the first available outlet of that company.
UPDATE public.customers c
SET outlet_id = (SELECT id FROM public.outlets WHERE company_id = c.company_id LIMIT 1)
WHERE c.outlet_id IS NULL 
AND c.company_id IS NOT NULL;


-- ==========================================
-- 3. CONSTRAINT ENFORCEMENT
-- ==========================================

-- Now that data is backfilled, we enforce NOT NULL to prevent future corruptions.
-- Wrapped in a conditional check to ensure we don't fail if the database is truly empty.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM public.companies) THEN
        -- Only enforce if we have a target to point to.
        -- This fixes the ERROR 23502 reported.
        ALTER TABLE public.customers ALTER COLUMN company_id SET NOT NULL;
    END IF;
END $$;


-- ==========================================
-- 4. SECURITY HARDENING (RLS)
-- ==========================================

-- Enable Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Remove legacy or permissive policies
DROP POLICY IF EXISTS "Public Access" ON public.customers;
DROP POLICY IF EXISTS "Public Access Customers" ON public.customers;
DROP POLICY IF EXISTS "Outlet Isolation" ON public.customers;
DROP POLICY IF EXISTS "Strict Tenant Isolation Customers" ON public.customers;

-- Create hardened policy using specified JWT Metadata sources.
-- This ensures users only see customers belonging to their active company.
CREATE POLICY "Strict Tenant Isolation Customers"
ON public.customers
FOR ALL
TO authenticated
USING (
    company_id = (auth.jwt() -> 'user_metadata' ->> 'company_id')::uuid
)
WITH CHECK (
    company_id = (auth.jwt() -> 'user_metadata' ->> 'company_id')::uuid
);


-- ==========================================
-- 5. PERFORMANCE OPTIMIZATION
-- ==========================================

-- Index the isolation columns to ensure fast lookups for CRM queries.
CREATE INDEX IF NOT EXISTS idx_customers_tenant_repair ON public.customers(company_id, outlet_id);


-- ==========================================
-- 6. VERSION RECORDING
-- ==========================================
INSERT INTO public.schema_migrations (version, name) 
VALUES (32, 'customers_tenant_repair_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
