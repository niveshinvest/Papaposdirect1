-- PAPAPOS MIGRATION 104: One-time admin invoice item backfill
-- Adds a guarded server-side UPSERT used only by the admin maintenance tool.

CREATE OR REPLACE FUNCTION public.admin_resync_invoice_items(
  p_invoice_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
  v_count integer := 0;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invoice_id is required';
  END IF;

  SELECT id, company_id, outlet_id
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  PERFORM set_config('papa.bypass_inventory_guard', 'true', true);

  FOR v_item IN SELECT * FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb)) AS (
    id uuid,
    invoice_id uuid,
    menu_item_id uuid,
    product_id uuid,
    quantity numeric,
    qty numeric,
    price numeric,
    taxable_value numeric,
    cgst_amount numeric,
    sgst_amount numeric,
    igst_amount numeric,
    total_amount numeric,
    discount_amount numeric,
    selected_modifiers jsonb,
    applied_promotions jsonb
  ) LOOP
    IF v_item.id IS NULL THEN
      RAISE EXCEPTION 'Every invoice item requires a stable id';
    END IF;

    INSERT INTO public.invoice_items (
      id,
      invoice_id,
      menu_item_id,
      quantity,
      taxable_value,
      cgst_amount,
      sgst_amount,
      igst_amount,
      total_amount,
      company_id,
      outlet_id,
      sync_status,
      updated_at,
      discount_amount,
      selected_modifiers,
      applied_promotions
    )
    VALUES (
      v_item.id,
      p_invoice_id,
      COALESCE(v_item.menu_item_id, v_item.product_id),
      COALESCE(v_item.quantity, v_item.qty, 0),
      COALESCE(v_item.taxable_value, v_item.price, v_item.total_amount, 0),
      COALESCE(v_item.cgst_amount, 0),
      COALESCE(v_item.sgst_amount, 0),
      COALESCE(v_item.igst_amount, 0),
      COALESCE(v_item.total_amount, v_item.price, v_item.taxable_value, 0),
      v_invoice.company_id,
      v_invoice.outlet_id,
      'synced',
      now(),
      COALESCE(v_item.discount_amount, 0),
      COALESCE(v_item.selected_modifiers, '[]'::jsonb),
      COALESCE(v_item.applied_promotions, '[]'::jsonb)
    )
    ON CONFLICT (id) DO UPDATE SET
      invoice_id = EXCLUDED.invoice_id,
      menu_item_id = EXCLUDED.menu_item_id,
      quantity = EXCLUDED.quantity,
      taxable_value = EXCLUDED.taxable_value,
      cgst_amount = EXCLUDED.cgst_amount,
      sgst_amount = EXCLUDED.sgst_amount,
      igst_amount = EXCLUDED.igst_amount,
      total_amount = EXCLUDED.total_amount,
      company_id = EXCLUDED.company_id,
      outlet_id = EXCLUDED.outlet_id,
      sync_status = 'synced',
      updated_at = now(),
      discount_amount = EXCLUDED.discount_amount,
      selected_modifiers = EXCLUDED.selected_modifiers,
      applied_promotions = EXCLUDED.applied_promotions;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'items_synced', v_count
  );
END;
$$;

INSERT INTO public.schema_migrations (version, name)
VALUES (104, 'admin_invoice_item_backfill')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
