
-- PAPAPOS MIGRATION 045: MENU ITEM TAX CONFIGURATION
-- Target: Supabase / Postgres

BEGIN;

-- 1. EXTEND MENU ITEMS TABLE
-- price_includes_tax: false = Exclusive (GST added on top), true = Inclusive (GST included in price)
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS price_includes_tax BOOLEAN NOT NULL DEFAULT false;

-- 2. DATA ALIGNMENT
-- Sync existing items to the new columns if they were using legacy fields
UPDATE public.menu_items 
SET 
    tax_percentage = COALESCE(gst_rate, 5),
    price_includes_tax = COALESCE(is_tax_inclusive, false);

-- 3. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (45, 'menu_item_granular_tax_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
