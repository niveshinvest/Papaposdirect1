-- Migration: 202_migrate_existing_stock.sql
-- Purpose: Migrate legacy procurement/purchase data into new inventory batch model
-- Idempotent: safe to run multiple times (checks for existing mappings)

BEGIN;

-- 1) Create missing master items from purchase item names
WITH distinct_names AS (
  SELECT DISTINCT pi.item_name, COALESCE(po.company_id, NULL) AS company_id
  FROM public.purchase_items pi
  LEFT JOIN public.procurement_orders po ON po.id = pi.purchase_order_id
)
INSERT INTO public.items (id, name, created_at)
SELECT gen_random_uuid(), dn.item_name, now()
FROM distinct_names dn
WHERE NOT EXISTS (SELECT 1 FROM public.items i WHERE i.name = dn.item_name);

DO $$
BEGIN
  IF EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'procurement_orders' AND column_name = 'supplier_id'
  ) THEN
    INSERT INTO public.purchase_orders (
      id, supplier_id, invoice_number, purchase_date, expected_delivery_date, outlet_id, total_amount, discount, tax, status, created_by, created_at
    )
    SELECT
      (po.id)::uuid,
      po.supplier_id,
      NULL::text AS invoice_number,
      po.order_date::date AS purchase_date,
      po.expected_delivery_date,
      po.outlet_id,
      COALESCE(po.total_amount, 0)::numeric,
      0::numeric,
      COALESCE(po.total_tax_amount, 0)::numeric,
      lower(COALESCE(po.status, 'draft')),
      NULL::uuid,
      COALESCE(po.created_at, now())
    FROM public.procurement_orders po
    WHERE NOT EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id::text = po.id::text);
  ELSE
    -- Fallback: procurement_orders has no supplier_id column; insert NULL for supplier
    INSERT INTO public.purchase_orders (
      id, supplier_id, invoice_number, purchase_date, expected_delivery_date, outlet_id, total_amount, discount, tax, status, created_by, created_at
    )
    SELECT
      po.id,
      NULL::uuid AS supplier_id,
      NULL::text AS invoice_number,
      po.order_date::date AS purchase_date,
      po.expected_delivery_date,
      po.outlet_id,
      COALESCE(po.total_amount, 0)::numeric,
      0::numeric,
      COALESCE(po.total_tax_amount, 0)::numeric,
      lower(COALESCE(po.status, 'draft')),
      NULL::uuid,
      COALESCE(po.created_at, now())
    FROM public.procurement_orders po
    WHERE NOT EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po.id);
  END IF;
END$$;

-- 3) Insert purchase_items (mapping item_name -> items.id)
INSERT INTO public.purchase_items (
  id, purchase_id, item_id, brand_id, batch_number, expiry_date, cost_price, selling_price, qty, received_qty, damaged_qty, free_qty, discount, tax, created_at
)
SELECT
  gen_random_uuid(),
  pi.purchase_order_id,
  i.id::text AS item_id,
  NULL::uuid AS brand_id,
  CONCAT('LEGACY-', pi.id)::text AS batch_number,
  NULL::date AS expiry_date,
  COALESCE(pi.unit_price, 0)::numeric AS cost_price,
  NULL::numeric AS selling_price,
  COALESCE(pi.qty,0)::numeric AS qty,
  COALESCE(pi.qty,0)::numeric AS received_qty,
  0::numeric AS damaged_qty,
  0::numeric AS free_qty,
  0::numeric AS discount,
  COALESCE(pi.tax_amount,0)::numeric AS tax,
  COALESCE(pi.created_at, now())
FROM public.purchase_items pi
JOIN public.items i ON i.name = pi.item_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.purchase_items pnew
  WHERE pnew.purchase_order_id = pi.purchase_order_id AND pnew.item_name = pi.item_name AND pnew.created_at = pi.created_at
);

-- 4) Create inventory_batches for each new purchase_item row
INSERT INTO public.inventory_batches (
  id, item_id, brand_id, batch_number, expiry_date, cost_price, selling_price, qty_available, purchase_item_id, outlet_id, created_at
)
SELECT
  gen_random_uuid(),
  pi_new.item_id,
  NULL::uuid,
  COALESCE(pi_new.batch_number, CONCAT('LEGACY-', pi_new.id)),
  pi_new.expiry_date,
  COALESCE(pi_new.cost_price, 0)::numeric,
  pi_new.selling_price,
  GREATEST(COALESCE(pi_new.received_qty, pi_new.qty, 0)::numeric, 0),
  pi_new.id AS purchase_item_id,
  po.outlet_id,
  COALESCE(pi_new.created_at, now())
FROM public.purchase_items pi_new
JOIN public.purchase_orders po ON po.id = pi_new.purchase_order_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory_batches b WHERE b.purchase_item_id = pi_new.id
);

-- 5) Insert stock_movements for these batches (initial purchase receipt)
INSERT INTO public.stock_movements (id, item_id, batch_id, type, reference_id, qty, before_qty, after_qty, reason, created_by, created_at)
SELECT
  gen_random_uuid(),
  b.item_id,
  b.id AS batch_id,
  'purchase'::text,
  b.purchase_item_id::uuid,
  b.qty_available::numeric,
  NULL::numeric,
  b.qty_available::numeric,
  'Initial import from legacy purchase_items'::text,
  NULL::uuid,
  COALESCE(b.created_at, now())
FROM public.inventory_batches b
LEFT JOIN public.stock_movements sm ON sm.reference_id = b.purchase_item_id AND sm.type = 'purchase'
WHERE sm.id IS NULL;

-- 6) Record migration applied
INSERT INTO public.schema_migrations (version, name) VALUES (202, 'migrate_legacy_stock_to_batches') ON CONFLICT (version) DO NOTHING;

COMMIT;
