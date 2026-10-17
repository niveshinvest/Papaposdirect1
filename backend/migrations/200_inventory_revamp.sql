-- Migration: 200_inventory_revamp.sql
-- Purpose: Add enterprise inventory tables (items, suppliers, brands,
-- purchase_orders/items, inventory_batches, stock_movements, transfers, adjustments)

BEGIN;

-- Items (master product catalog)
CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text,
  barcode text,
  category_id uuid,
  sub_category_id uuid,
  unit text,
  hsn_code text,
  gst_rate numeric(5,2),
  is_tax_inclusive boolean DEFAULT false,
  track_inventory boolean DEFAULT true,
  min_stock_level numeric DEFAULT 0,
  max_stock_level numeric DEFAULT 0,
  reorder_level numeric DEFAULT 0,
  default_supplier_id uuid,
  default_brand_id uuid,
  auto_reorder_enabled boolean DEFAULT false,
  image_url text,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  gst_number text,
  address text,
  city text,
  state text,
  country text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Brands
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Purchase orders (header)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id),
  invoice_number text,
  purchase_date date,
  expected_delivery_date date,
  outlet_id text,
  total_amount numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  status text DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
-- Ensure columns exist when table pre-exists in legacy schemas
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS purchase_date date,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date,
  ADD COLUMN IF NOT EXISTS outlet_id text,
  ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'supplier_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
  END IF;
END$$;

-- Purchase items (per-line, includes brand/batch info)
CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id text,
  brand_id uuid REFERENCES brands(id),
  batch_number text,
  expiry_date date,
  cost_price numeric,
  selling_price numeric,
  qty numeric DEFAULT 0,
  received_qty numeric DEFAULT 0,
  damaged_qty numeric DEFAULT 0,
  free_qty numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_item ON purchase_items(item_id);
-- Ensure purchase_items columns exist for legacy schemas
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS purchase_id uuid,
  ADD COLUMN IF NOT EXISTS item_id text,
  ADD COLUMN IF NOT EXISTS brand_id uuid,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS cost_price numeric,
  ADD COLUMN IF NOT EXISTS selling_price numeric,
  ADD COLUMN IF NOT EXISTS qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Inventory batches: each purchase line produces one or more batches
CREATE TABLE IF NOT EXISTS inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text,
  brand_id uuid REFERENCES brands(id),
  batch_number text,
  expiry_date date,
  cost_price numeric,
  selling_price numeric,
  qty_available numeric DEFAULT 0,
  purchase_item_id uuid REFERENCES purchase_items(id) ON DELETE SET NULL,
  outlet_id text,
  created_at timestamptz DEFAULT now()
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_batches' AND column_name = 'item_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_batches_item ON inventory_batches(item_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_batches' AND column_name = 'outlet_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_batches_outlet ON inventory_batches(outlet_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_batches' AND column_name = 'batch_number'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_batches_batchnum ON inventory_batches(batch_number);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_batches' AND column_name = 'expiry_date'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiry_date);
  END IF;
END$$;
-- Ensure inventory_batches columns exist when the table was created previously without them
ALTER TABLE inventory_batches
  ADD COLUMN IF NOT EXISTS item_id text,
  ADD COLUMN IF NOT EXISTS brand_id uuid,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS cost_price numeric,
  ADD COLUMN IF NOT EXISTS selling_price numeric,
  ADD COLUMN IF NOT EXISTS qty_available numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_item_id uuid,
  ADD COLUMN IF NOT EXISTS outlet_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Stock movements (audit log)
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text,
  batch_id uuid REFERENCES inventory_batches(id) ON DELETE SET NULL,
  type text NOT NULL,
  reference_id uuid,
  qty numeric NOT NULL,
  before_qty numeric,
  after_qty numeric,
  reason text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'item_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_movements_item ON stock_movements(item_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'batch_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_movements_batch ON stock_movements(batch_id);
  END IF;
END$$;
-- Ensure stock_movements columns exist for older schemas
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS item_id text,
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS reference_id uuid,
  ADD COLUMN IF NOT EXISTS qty numeric,
  ADD COLUMN IF NOT EXISTS before_qty numeric,
  ADD COLUMN IF NOT EXISTS after_qty numeric,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Stock transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_outlet text,
  to_outlet text,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  approved_by uuid
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid REFERENCES stock_transfers(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES inventory_batches(id) ON DELETE RESTRICT,
  qty numeric
);

-- Stock adjustments
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id text,
  reason text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_adjustment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id uuid REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  item_id text,
  batch_id uuid REFERENCES inventory_batches(id) ON DELETE SET NULL,
  qty numeric
);

-- Convenience view: stock per item/outlet (sum of qty_available)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_batches' AND column_name = 'item_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_batches' AND column_name = 'outlet_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_batches' AND column_name = 'qty_available'
  ) THEN
    CREATE OR REPLACE VIEW inventory_stock_summary AS
    SELECT
      b.item_id,
      b.outlet_id,
      SUM(b.qty_available) AS qty_available,
      SUM(b.qty_available * COALESCE(b.cost_price,0)) AS stock_value
    FROM inventory_batches b
    GROUP BY b.item_id, b.outlet_id;
  END IF;
END$$;

-- RPC: FIFO allocator for sales. Returns setof (batch_id, qty_allocated)
-- Usage: SELECT * FROM fifo_allocate_stock(item_uuid, outlet_uuid, required_qty);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_batches' AND column_name = 'item_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_batches' AND column_name = 'qty_available'
  ) THEN
    CREATE OR REPLACE FUNCTION fifo_allocate_stock(p_item text, p_outlet text, p_required numeric)
    RETURNS TABLE(batch_id uuid, qty_allocated numeric) LANGUAGE plpgsql AS $func$
    DECLARE
      remaining numeric := p_required;
      r RECORD;
    BEGIN
      FOR r IN
        SELECT id, qty_available FROM inventory_batches
        WHERE item_id = p_item
          AND (p_outlet IS NULL OR outlet_id::text = p_outlet)
          AND qty_available > 0
        ORDER BY expiry_date NULLS LAST, created_at ASC
      LOOP
        IF remaining <= 0 THEN
          RETURN;
        END IF;
        IF r.qty_available <= remaining THEN
          batch_id := r.id;
          qty_allocated := r.qty_available;
          remaining := remaining - r.qty_available;
          RETURN NEXT;
        ELSE
          batch_id := r.id;
          qty_allocated := remaining;
          remaining := 0;
          RETURN NEXT;
        END IF;
      END LOOP;
      RETURN;
    END;
    $func$;
  END IF;
END$$;

COMMIT;

-- Note: Data migration steps (populating items, batches from existing schema)
-- should be executed after reviewing current product/purchase tables.
