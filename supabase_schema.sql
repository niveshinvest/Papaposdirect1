
-- PAPAPOS SUPABASE SCHEMA UPDATE
-- Add missing Outlet Hierarchy fields

ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "pincode" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "stateCode" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "gstin" TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_outlets_gstin ON public.outlets(gstin);
CREATE INDEX IF NOT EXISTS idx_outlets_state ON public.outlets("stateCode");

-- RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (3, 'outlets_gst_hierarchy_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
