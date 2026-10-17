-- Migration: 206_deprecate_procurement_orders.sql
-- Purpose: Safely deprecate `procurement_orders` by migrating any remaining rows, dropping policies, and renaming the table.

BEGIN;

-- 1) Ensure any rows not yet copied into `purchase_orders` are copied over (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='procurement_orders') THEN
    INSERT INTO public.purchase_orders (id, supplier_id, invoice_number, purchase_date, expected_delivery_date, outlet_id, total_amount, discount, tax, status, created_by, created_at)
    SELECT
      (po.id)::uuid,
      -- supplier_id may or may not exist in legacy schema
      (CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='procurement_orders' AND column_name='supplier_id') THEN po.supplier_id ELSE NULL END),
      NULL::text,
      (CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='procurement_orders' AND column_name='order_date') THEN po.order_date::date ELSE NULL END),
      (CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='procurement_orders' AND column_name='expected_delivery_date') THEN po.expected_delivery_date ELSE NULL END),
      (CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='procurement_orders' AND column_name='outlet_id') THEN po.outlet_id::text ELSE NULL END),
      (CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='procurement_orders' AND column_name='total_amount') THEN COALESCE(po.total_amount,0)::numeric ELSE 0::numeric END),
      0::numeric,
      (CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='procurement_orders' AND column_name='total_tax_amount') THEN COALESCE(po.total_tax_amount,0)::numeric ELSE 0::numeric END),
      lower(COALESCE((CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='procurement_orders' AND column_name='status') THEN po.status ELSE 'draft' END), 'draft')),
      NULL::uuid,
      COALESCE((CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='procurement_orders' AND column_name='created_at') THEN po.created_at ELSE now() END), now())
    FROM public.procurement_orders po
    WHERE NOT EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id::text = po.id::text);
  END IF;
END$$;

-- 2) Drop RLS policies that reference `procurement_orders` (if any)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname='procurement_orders') THEN
    -- Drop known policies (created by migrations) if present
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "Procurement visibility" ON public.procurement_orders';
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "Management manage procurement" ON public.procurement_orders';
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END$$;

-- 3) Rename the table to keep an audit copy (non-destructive). This can be fully dropped later.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='procurement_orders') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='procurement_orders_deprecated') THEN
      EXECUTE 'ALTER TABLE public.procurement_orders RENAME TO procurement_orders_deprecated';
    END IF;
  END IF;
END$$;

-- Record migration
INSERT INTO public.schema_migrations (version, name) VALUES (206, 'deprecate_procurement_orders') ON CONFLICT (version) DO NOTHING;

COMMIT;

-- NOTE: After verification, you may drop `procurement_orders_deprecated` or archive it elsewhere.
