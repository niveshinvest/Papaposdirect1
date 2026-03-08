
-- PAPAPOS MIGRATION 025: OPERATIONAL COLUMN FOUNDATION
-- Target: Supabase / Postgres
-- Fixes: "column company_id does not exist" in line-item and log tables.

-- 1. SALES LINE ITEMS
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);

-- 2. PROCUREMENT LINE ITEMS
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);

-- 3. DELIVERY LINE ITEMS
ALTER TABLE public.delivery_order_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.delivery_order_items ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);

-- 4. KITCHEN LOGS
ALTER TABLE public.kitchen_status_logs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.kitchen_status_logs ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (25, 'operational_foundation_columns')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
