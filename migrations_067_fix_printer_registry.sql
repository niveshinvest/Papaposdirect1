
-- PAPAPOS MIGRATION 067: FIX PRINTER REGISTRY
-- Target: Supabase / Postgres
-- Description: Creates the 'printers' table as per strict production requirements.

BEGIN;

-- 1. Create the printers table
CREATE TABLE IF NOT EXISTS public.printers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    printer_type TEXT NOT NULL CHECK (printer_type IN ('BLUETOOTH', 'USB', 'LAN', 'SYSTEM')),
    connection_hint TEXT, -- mac / ip / bt name
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_printer_per_outlet UNIQUE (company_id, outlet_id, name)
);

-- 2. Security (RLS)
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;

-- Policy: Strict Tenant Isolation
DROP POLICY IF EXISTS "Printers Tenant Isolation" ON public.printers;
CREATE POLICY "Printers Tenant Isolation" 
ON public.printers
FOR ALL
TO authenticated
USING (
    company_id = public.get_my_company_id()
)
WITH CHECK (
    company_id = public.get_my_company_id()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_printers_outlet ON public.printers(outlet_id);
CREATE INDEX IF NOT EXISTS idx_printers_company ON public.printers(company_id);

-- 4. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_printers_updated_at ON public.printers;
CREATE TRIGGER update_printers_updated_at
    BEFORE UPDATE ON public.printers
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- 5. Record Version
INSERT INTO public.schema_migrations (version, name) 
VALUES (67, 'fix_printer_registry')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
