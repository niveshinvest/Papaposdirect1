
-- PAPAPOS MIGRATION 028: BILL_TAXES REPAIR BUNDLE
-- Target: Supabase / Postgres

-- 1. SCHEMA FOUNDATION
ALTER TABLE public.bill_taxes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.bill_taxes ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);

-- 2. DATA BACKFILL
UPDATE public.bill_taxes bt
SET company_id = b.company_id, outlet_id = b.outlet_id
FROM public.bills b
WHERE bt.bill_id = b.id AND bt.company_id IS NULL;

-- 3. CONSTRAINTS & INDEXES
-- If there's existing data that couldn't be mapped, this might fail. 
-- In a repair scenario, we prioritize structural integrity.
ALTER TABLE public.bill_taxes ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bill_taxes_tenant_isolation ON public.bill_taxes(company_id, outlet_id);

-- 4. SECURITY (RLS)
ALTER TABLE public.bill_taxes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Operational Isolation" ON public.bill_taxes;
CREATE POLICY "Operational Isolation" ON public.bill_taxes 
FOR ALL TO authenticated 
USING (company_id = public.get_my_company_id()) 
WITH CHECK (company_id = public.get_my_company_id());

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (28, 'bill_taxes_repair_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
