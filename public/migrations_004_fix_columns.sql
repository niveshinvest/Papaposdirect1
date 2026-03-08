
-- PAPAPOS MIGRATION 004: SCHEMA ALIGNMENT FIX
-- Target: Supabase / Postgres

-- 1. ENSURE ALL COLUMNS EXIST WITH EXACT CASING
-- We use double quotes to match the CamelCase property names used in the frontend JS payload
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "state_code" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "subscriptionActive" BOOLEAN DEFAULT TRUE;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "pincode" TEXT;

-- 2. ENSURE RLS FOR NEW COLUMNS (IF ANY)
-- Policies usually cover the whole row, but we refresh the cache by touching the table
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;

-- 3. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (4, 'fix_outlet_column_casing')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
