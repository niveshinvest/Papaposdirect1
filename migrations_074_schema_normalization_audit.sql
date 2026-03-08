
-- PAPAPOS MIGRATION 074: SCHEMA NORMALIZATION & AUDIT SYSTEM
-- Target: Supabase / Postgres
-- Description: Normalizes schemas, adds missing foreign keys, and implements the POS audit system.

-- 1. POS ORDER AUDIT SYSTEM
CREATE TABLE IF NOT EXISTS public.pos_order_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    original_data JSONB NOT NULL,
    edited_data JSONB NOT NULL,
    reason TEXT NOT NULL,
    edited_by UUID NOT NULL REFERENCES public.profiles(id),
    edited_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. WHATSAPP MESSAGES (INBOUND/OUTBOUND)
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    message TEXT NOT NULL,
    direction TEXT CHECK (direction IN ('INBOUND', 'OUTBOUND')) DEFAULT 'INBOUND',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PURCHASE ITEMS NORMALIZATION
-- Add inventory_id to purchase_items
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS inventory_id UUID REFERENCES public.inventory(id);

-- Backfill inventory_id from item_name
UPDATE public.purchase_items pi
SET inventory_id = i.id
FROM public.inventory i
WHERE pi.item_name = i.name 
AND pi.inventory_id IS NULL;

-- 4. RECIPES NORMALIZATION
-- Add menu_item_id to recipes
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS menu_item_id UUID REFERENCES public.menu_items(id);

-- Backfill menu_item_id from item_name
UPDATE public.recipes r
SET menu_item_id = mi.id
FROM public.menu_items mi
WHERE r.item_name = mi.name
AND r.menu_item_id IS NULL;

-- 5. INDEXING FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_pos_order_audit_order ON public.pos_order_audit(order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_company_outlet ON public.whatsapp_messages(company_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_inventory ON public.purchase_items(inventory_id);
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item ON public.recipes(menu_item_id);

-- 6. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (74, 'schema_normalization_audit_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
