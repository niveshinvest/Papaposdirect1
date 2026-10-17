
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

-- HYBRID SYNC: Sync failures (cloud safety net)
CREATE TABLE IF NOT EXISTS public.sync_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL,
  outlet_id uuid NOT NULL,

  table_name text NOT NULL,
  payload jsonb NOT NULL,
  error text,

  device_id text,

  retry_count int DEFAULT 0,
  status text DEFAULT 'pending',

  synced boolean DEFAULT false,

  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_failures_company
ON public.sync_failures (company_id, outlet_id, synced);

-- RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (3, 'outlets_gst_hierarchy_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.schema_migrations (version, name)
VALUES (4, 'sync_failures_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
