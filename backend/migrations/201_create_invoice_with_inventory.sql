-- Migration: 201_create_invoice_with_inventory.sql
-- Purpose: Add invoice allocation table and RPC to create invoice + consume FIFO stock atomically

BEGIN;

-- Allocation mapping table (records which batches served which invoice item)
CREATE TABLE IF NOT EXISTS invoice_item_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_item_id uuid NOT NULL REFERENCES public.invoice_items(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES inventory_batches(id) ON DELETE SET NULL,
  qty_allocated numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_allocations_invoice_item ON invoice_item_allocations(invoice_item_id);

-- RPC: create invoice with transactional FIFO consumption
-- Expects a JSON payload with invoice header and items array, e.g.:
-- {"invoice": {..header..}, "items": [{"menu_item_id":"...","quantity":1,...}], "user_id":"..."}
CREATE OR REPLACE FUNCTION public.create_invoice_with_inventory(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_invoice_id uuid;
  v_item RECORD;
  v_alloc RECORD;
  v_item_id uuid;
  v_mapped_item uuid;
  v_total_alloc numeric;
BEGIN
  -- Insert invoice header
  INSERT INTO public.invoices(
    company_id, outlet_id, order_id, invoice_number, billing_state_code, outlet_state_code,
    subtotal, cgst_amount, sgst_amount, igst_amount, total_tax, round_off, grand_total, payment_method, created_at
  )
  SELECT
    (p_payload->'invoice'->>'company_id')::uuid,
    p_payload->'invoice'->>'outlet_id',
    p_payload->'invoice'->>'order_id',
    p_payload->'invoice'->>'invoice_number',
    p_payload->'invoice'->>'billing_state_code',
    p_payload->'invoice'->>'outlet_state_code',
    (p_payload->'invoice'->>'subtotal')::numeric,
    (p_payload->'invoice'->>'cgst_amount')::numeric,
    (p_payload->'invoice'->>'sgst_amount')::numeric,
    (p_payload->'invoice'->>'igst_amount')::numeric,
    (p_payload->'invoice'->>'total_tax')::numeric,
    (p_payload->'invoice'->>'round_off')::numeric,
    (p_payload->'invoice'->>'grand_total')::numeric,
    p_payload->'invoice'->>'payment_method',
    now()
  RETURNING id INTO v_invoice_id;

  -- Process each item; allocate from FIFO batches when possible
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_payload->'items') AS (
    menu_item_id uuid,
    quantity numeric,
    taxable_value numeric,
    cgst_amount numeric,
    sgst_amount numeric,
    igst_amount numeric,
    total_amount numeric
  ) LOOP
    -- Insert invoice item
    INSERT INTO public.invoice_items(invoice_id, menu_item_id, quantity, taxable_value, cgst_amount, sgst_amount, igst_amount, total_amount)
    VALUES (v_invoice_id, v_item.menu_item_id, v_item.quantity, v_item.taxable_value, v_item.cgst_amount, v_item.sgst_amount, v_item.igst_amount, v_item.total_amount)
    RETURNING id INTO v_item_id;

    -- Attempt to map menu_item_id -> items.id if mapping exists (backward compatibility)
    SELECT i.id INTO v_mapped_item
    FROM public.items i
    JOIN public.menu_items m ON m.id = v_item.menu_item_id
    WHERE i.id IS NOT NULL
    LIMIT 1;

    IF v_mapped_item IS NOT NULL THEN
      v_total_alloc := 0;
      -- Allocate using FIFO RPC
        FOR v_alloc IN SELECT * FROM fifo_allocate_stock(v_mapped_item::text, p_payload->'invoice'->>'outlet_id', v_item.quantity) LOOP
        -- update batch
        UPDATE inventory_batches SET qty_available = qty_available - v_alloc.qty_allocated WHERE id = v_alloc.batch_id;
        -- record allocation
        INSERT INTO invoice_item_allocations(invoice_item_id, batch_id, qty_allocated) VALUES (v_item_id, v_alloc.batch_id, v_alloc.qty_allocated);
        -- insert stock movement
        INSERT INTO stock_movements(item_id, batch_id, type, reference_id, qty, before_qty, after_qty, created_by, created_at)
        VALUES (v_mapped_item::text, v_alloc.batch_id, 'sale', v_invoice_id, v_alloc.qty_allocated, NULL, NULL, (p_payload->>'user_id')::uuid, now());
        v_total_alloc := v_total_alloc + v_alloc.qty_allocated;
      END LOOP;

      IF v_total_alloc < v_item.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for menu_item_id % (required: %, allocated: %)', v_item.menu_item_id, v_item.quantity, v_total_alloc;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('invoice_id', v_invoice_id);
END;
$$ SECURITY DEFINER;

COMMIT;
