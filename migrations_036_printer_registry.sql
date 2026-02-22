
-- PAPAPOS MIGRATION 036: ENHANCED PRINTER REGISTRY
-- Target: Supabase / Postgres
-- Description: Supports modern connection types and multi-role (Bill/KOT) assignment.

BEGIN;

-- 1. Create specialized printer type
DO $$ BEGIN
    CREATE TYPE printer_connection_type AS ENUM ('bluetooth', 'wifi', 'wired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create the registry table
CREATE TABLE IF NOT EXISTS public.printers_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    printer_type printer_connection_type NOT NULL,
    connection_info JSONB NOT NULL DEFAULT '{}'::jsonb, -- stores {ip: '', mac: '', usb_name: ''}
    roles JSONB NOT NULL DEFAULT '["KOT"]'::jsonb, -- array containing "BILL", "KOT"
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Security (RLS)
ALTER TABLE public.printers_registry ENABLE ROW LEVEL SECURITY;

-- Policy: Strict Tenant & Outlet Isolation
DROP POLICY IF EXISTS "Registry Isolation" ON public.printers_registry;
CREATE POLICY "Registry Isolation" 
ON public.printers_registry
FOR ALL
TO authenticated
USING (
    company_id = public.get_my_company_id() 
    AND 
    outlet_id = (auth.jwt() -> 'user_metadata' ->> 'outlet_id')
)
WITH CHECK (
    company_id = public.get_my_company_id() 
    AND 
    outlet_id = (auth.jwt() -> 'user_metadata' ->> 'outlet_id')
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_printers_registry_outlet ON public.printers_registry(outlet_id);
CREATE INDEX IF NOT EXISTS idx_printers_registry_roles ON public.printers_registry USING gin (roles);

-- 5. Record Version
INSERT INTO public.schema_migrations (version, name) 
VALUES (36, 'printer_registry_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
