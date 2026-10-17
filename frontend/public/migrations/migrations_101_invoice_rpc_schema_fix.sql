-- PAPAPOS MIGRATION 101: Invoice RPC schema compliance
-- Ensures create_invoice_with_inventory writes all required invoice header fields.

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS taxable_value NUMERIC(15,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_type TEXT NOT NULL DEFAULT 'CGST_SGST',
ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cgst_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS sgst_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS igst_total NUMERIC DEFAULT 0;

ALTER TABLE public.invoice_items
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id),
ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);

CREATE OR REPLACE FUNCTION public.create_invoice_with_inventory(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_id uuid;
  v_item RECORD;
  v_alloc RECORD;
  v_item_id uuid;
  v_mapped_item uuid;
  v_total_alloc numeric;
  v_invoice jsonb := COALESCE(p_payload->'invoice', '{}'::jsonb);
  v_taxable_value numeric := COALESCE(NULLIF(v_invoice->>'taxable_value', '')::numeric, NULLIF(v_invoice->>'subtotal', '')::numeric, 0);
  v_total_tax numeric := COALESCE(NULLIF(v_invoice->>'total_tax', '')::numeric, 0);
  v_grand_total numeric := COALESCE(NULLIF(v_invoice->>'grand_total', '')::numeric, NULLIF(v_invoice->>'total_amount', '')::numeric, v_taxable_value + v_total_tax);
  v_cgst numeric := COALESCE(NULLIF(v_invoice->>'cgst_total', '')::numeric, NULLIF(v_invoice->>'cgst_amount', '')::numeric, 0);
  v_sgst numeric := COALESCE(NULLIF(v_invoice->>'sgst_total', '')::numeric, NULLIF(v_invoice->>'sgst_amount', '')::numeric, 0);
  v_igst numeric := COALESCE(NULLIF(v_invoice->>'igst_total', '')::numeric, NULLIF(v_invoice->>'igst_amount', '')::numeric, 0);
BEGIN
  INSERT INTO public.invoices(
    id, company_id, outlet_id, order_id, invoice_number, invoice_date,
    invoice_type, billing_state_code, outlet_state_code, place_of_supply,
    buyer_name, buyer_gstin, buyer_state_code,
    seller_gstin, seller_legal_name, seller_trade_name, seller_state_code,
    subtotal, taxable_value, total_amount, cgst_amount, sgst_amount, igst_amount,
    cgst_total, sgst_total, igst_total, total_tax, round_off, grand_total,
    gst_type, payment_method, payment_mode_id, payment_mode_name,
    finalized_by_user_id, finalized_at, qr_payload, irp_status, created_at
  )
  VALUES (
    COALESCE(NULLIF(v_invoice->>'id', '')::uuid, gen_random_uuid()),
    (v_invoice->>'company_id')::uuid,
    v_invoice->>'outlet_id',
    v_invoice->>'order_id',
    v_invoice->>'invoice_number',
    COALESCE(NULLIF(v_invoice->>'invoice_date', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(v_invoice->>'invoice_type', ''), 'B2C'),
    COALESCE(NULLIF(v_invoice->>'billing_state_code', ''), NULLIF(v_invoice->>'buyer_state_code', ''), '27'),
    COALESCE(NULLIF(v_invoice->>'outlet_state_code', ''), NULLIF(v_invoice->>'seller_state_code', ''), '27'),
    v_invoice->>'place_of_supply',
    v_invoice->>'buyer_name',
    v_invoice->>'buyer_gstin',
    v_invoice->>'buyer_state_code',
    v_invoice->>'seller_gstin',
    v_invoice->>'seller_legal_name',
    v_invoice->>'seller_trade_name',
    v_invoice->>'seller_state_code',
    COALESCE(NULLIF(v_invoice->>'subtotal', '')::numeric, v_taxable_value),
    v_taxable_value,
    COALESCE(NULLIF(v_invoice->>'total_amount', '')::numeric, v_grand_total),
    v_cgst,
    v_sgst,
    v_igst,
    v_cgst,
    v_sgst,
    v_igst,
    v_total_tax,
    COALESCE(NULLIF(v_invoice->>'round_off', '')::numeric, 0),
    v_grand_total,
    COALESCE(NULLIF(v_invoice->>'gst_type', ''), CASE WHEN v_igst > 0 THEN 'IGST' ELSE 'CGST_SGST' END),
    COALESCE(NULLIF(v_invoice->>'payment_method', ''), 'Cash'),
    NULLIF(v_invoice->>'payment_mode_id', '')::uuid,
    v_invoice->>'payment_mode_name',
    NULLIF(v_invoice->>'finalized_by_user_id', '')::uuid,
    COALESCE(NULLIF(v_invoice->>'finalized_at', '')::timestamptz, now()),
    v_invoice->>'qr_payload',
    COALESCE(NULLIF(v_invoice->>'irp_status', ''), 'NOT_GENERATED'),
    COALESCE(NULLIF(v_invoice->>'created_at', '')::timestamptz, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    sync_status = 'synced'
  RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(COALESCE(p_payload->'items', '[]'::jsonb)) AS (
    id uuid,
    menu_item_id uuid,
    quantity numeric,
    taxable_value numeric,
    cgst_amount numeric,
    sgst_amount numeric,
    igst_amount numeric,
    total_amount numeric
  ) LOOP
    INSERT INTO public.invoice_items(
      id, invoice_id, menu_item_id, quantity, taxable_value, cgst_amount, sgst_amount, igst_amount, total_amount,
      company_id, outlet_id
    )
    VALUES (
      COALESCE(v_item.id, gen_random_uuid()),
      v_invoice_id,
      v_item.menu_item_id,
      COALESCE(v_item.quantity, 0),
      COALESCE(v_item.taxable_value, 0),
      COALESCE(v_item.cgst_amount, 0),
      COALESCE(v_item.sgst_amount, 0),
      COALESCE(v_item.igst_amount, 0),
      COALESCE(v_item.total_amount, 0),
      (v_invoice->>'company_id')::uuid,
      v_invoice->>'outlet_id'
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_item_id;

    IF v_item_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT i.id INTO v_mapped_item
    FROM public.items i
    JOIN public.menu_items m ON m.id = v_item.menu_item_id
    WHERE i.id IS NOT NULL
    LIMIT 1;

    IF v_mapped_item IS NOT NULL THEN
      v_total_alloc := 0;

      FOR v_alloc IN SELECT * FROM fifo_allocate_stock(v_mapped_item::text, v_invoice->>'outlet_id', COALESCE(v_item.quantity, 0)) LOOP
        UPDATE inventory_batches
        SET qty_available = qty_available - v_alloc.qty_allocated
        WHERE id = v_alloc.batch_id;

        INSERT INTO invoice_item_allocations(invoice_item_id, batch_id, qty_allocated)
        VALUES (v_item_id, v_alloc.batch_id, v_alloc.qty_allocated)
        ON CONFLICT DO NOTHING;

        INSERT INTO stock_movements(item_id, batch_id, type, reference_id, qty, before_qty, after_qty, created_by, created_at)
        VALUES (v_mapped_item::text, v_alloc.batch_id, 'sale', v_invoice_id, v_alloc.qty_allocated, NULL, NULL, NULLIF(p_payload->>'user_id', '')::uuid, now());

        v_total_alloc := v_total_alloc + v_alloc.qty_allocated;
      END LOOP;

      IF v_total_alloc < COALESCE(v_item.quantity, 0) THEN
        RAISE EXCEPTION 'Insufficient stock for menu_item_id % (required: %, allocated: %)', v_item.menu_item_id, v_item.quantity, v_total_alloc;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('invoice_id', v_invoice_id);
END;
$$;

INSERT INTO public.schema_migrations (version, name)
VALUES (101, 'invoice_rpc_schema_compliance')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
