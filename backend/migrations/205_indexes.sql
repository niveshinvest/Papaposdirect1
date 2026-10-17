-- Migration: 205_indexes.sql
-- Purpose: Add indexes to improve inventory and purchase query performance for high volume datasets

BEGIN;

-- Inventory batches lookups (common queries: by item, outlet, expiry, available qty)
CREATE INDEX IF NOT EXISTS idx_inventory_batches_item_outlet ON public.inventory_batches(item_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_outlet_expiry ON public.inventory_batches(outlet_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_qty_positive ON public.inventory_batches(item_id) WHERE qty_available > 0;

-- Purchase items lookups
CREATE INDEX IF NOT EXISTS idx_purchase_items_item ON public.purchase_items(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.purchase_items(purchase_id);

-- Stock movements (audit) - query by item, batch, recent movements
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_created ON public.stock_movements(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON public.stock_movements(batch_id);

-- Inventory summary includes aggregates from inventory_batches; index batches by (item_id, outlet_id)
CREATE INDEX IF NOT EXISTS idx_batches_item_outlet ON public.inventory_batches(item_id, outlet_id);

-- Ensure invoices lookups are fast for analytic RPCs
CREATE INDEX IF NOT EXISTS idx_invoices_company_outlet_created ON public.invoices(company_id, outlet_id, created_at DESC);

INSERT INTO public.schema_migrations (version, name) VALUES (205, 'indexes_inventory_perf') ON CONFLICT (version) DO NOTHING;

COMMIT;
