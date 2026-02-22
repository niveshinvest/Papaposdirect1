
-- PAPAPOS MIGRATION 026: IDENTITY BACKFILL & CONSTRAINTS
-- Target: Supabase / Postgres
-- Description: Syncs child identity with parent identity and enforces data integrity.

BEGIN;

-- 1. BACKFILL SALES ITEMS FROM ORDERS
UPDATE public.order_items oi
SET company_id = o.company_id, outlet_id = o.outlet_id
FROM public.orders o
WHERE oi.order_id = o.id AND oi.company_id IS NULL;

-- 2. BACKFILL PURCHASE ITEMS FROM PROCUREMENT ORDERS
UPDATE public.purchase_items pi
SET company_id = po.company_id, outlet_id = po.outlet_id
FROM public.procurement_orders po
WHERE pi.purchase_order_id = po.id AND pi.company_id IS NULL;

-- 3. BACKFILL DELIVERY ITEMS FROM DELIVERY ORDERS
UPDATE public.delivery_order_items doi
SET company_id = d.company_id, outlet_id = d.outlet_id
FROM public.delivery_orders d
WHERE doi.order_id = d.id AND doi.company_id IS NULL;

-- 4. BACKFILL KITCHEN LOGS FROM KITCHEN ORDERS
UPDATE public.kitchen_status_logs ksl
SET company_id = ko.company_id, outlet_id = ko.outlet_id
FROM public.kitchen_orders ko
WHERE ksl.kitchen_order_id = ko.id AND ksl.company_id IS NULL;

-- 5. ENFORCE CONSTRAINTS (ONLY AFTER BACKFILL)
ALTER TABLE public.order_items ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.purchase_items ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.delivery_order_items ALTER COLUMN company_id SET NOT NULL;

-- 6. PERFORMANCE INDEXING
CREATE INDEX IF NOT EXISTS idx_order_items_tenant ON public.order_items(company_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_tenant ON public.purchase_items(company_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_delivery_items_tenant ON public.delivery_order_items(company_id, outlet_id);

-- 7. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (26, 'identity_backfill_enforcement')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
