-- PAPAPOS MIGRATION 105: Safe sales edit/delete audit extension
-- Target: Supabase / Postgres
-- Scope: invoices as the canonical sales table. No hard sale deletes.

-- 1. Permission catalog entries used by RBAC editors.
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  code TEXT,
  name TEXT,
  label TEXT,
  module TEXT NOT NULL DEFAULT 'General',
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS module TEXT DEFAULT 'General';
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_key ON public.permissions(key);

INSERT INTO public.permissions (key, code, name, label, module, is_active)
VALUES
  ('sale.edit', 'sale.edit', 'Edit Sale', 'Edit Sale', 'Sales', TRUE),
  ('sale.delete', 'sale.delete', 'Delete Sale', 'Delete Sale', 'Sales', TRUE),
  ('sale.override_price', 'sale.override_price', 'Override Sale Price', 'Override Sale Price', 'Sales', TRUE)
ON CONFLICT (key) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  label = EXCLUDED.label,
  module = EXCLUDED.module,
  is_active = TRUE;

-- 2. Non-destructive sale delete flags on canonical sales table.
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_not_deleted_created
ON public.invoices(company_id, outlet_id, created_at DESC)
WHERE is_deleted = FALSE;

ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS item_name TEXT;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS tax_amount NUMERIC DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS selected_modifiers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS applied_promotions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';

-- 3. Dedicated sale audit/delete logs.
CREATE TABLE IF NOT EXISTS public.sales_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  action_type TEXT NOT NULL CHECK (action_type IN ('EDIT', 'DELETE')),
  old_data JSONB NOT NULL,
  new_data JSONB NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL,
  performed_by UUID NOT NULL REFERENCES public.profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales_delete_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  deleted_by UUID NOT NULL REFERENCES public.profiles(id),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_audit_log_sale_id
ON public.sales_audit_log(sale_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_delete_log_sale_id
ON public.sales_delete_log(sale_id, deleted_at DESC);

ALTER TABLE public.sales_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_delete_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_audit_log_select_company" ON public.sales_audit_log;
CREATE POLICY "sales_audit_log_select_company" ON public.sales_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = sales_audit_log.sale_id
        AND public.can_access_company(i.company_id)
    )
  );

DROP POLICY IF EXISTS "sales_delete_log_select_company" ON public.sales_delete_log;
CREATE POLICY "sales_delete_log_select_company" ON public.sales_delete_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = sales_delete_log.sale_id
        AND public.can_access_company(i.company_id)
    )
  );

CREATE OR REPLACE FUNCTION public.sale_actor_has_permission(
  p_actor_id UUID,
  p_company_id UUID,
  p_outlet_id TEXT,
  p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF p_actor_id IS NULL OR p_company_id IS NULL OR p_permission IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.owners
    WHERE profile_id = p_actor_id AND company_id = p_company_id
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT TRUE INTO v_allowed
  FROM public.company_users cu
  WHERE cu.profile_id = p_actor_id
    AND cu.company_id = p_company_id
    AND (cu.permissions ? p_permission)
    AND COALESCE((cu.permissions ->> p_permission)::BOOLEAN, FALSE)
  LIMIT 1;
  IF COALESCE(v_allowed, FALSE) THEN RETURN TRUE; END IF;

  SELECT TRUE INTO v_allowed
  FROM public.outlet_users ou
  WHERE ou.profile_id = p_actor_id
    AND ou.outlet_id = p_outlet_id
    AND (ou.permissions ? p_permission)
    AND COALESCE((ou.permissions ->> p_permission)::BOOLEAN, FALSE)
  LIMIT 1;
  IF COALESCE(v_allowed, FALSE) THEN RETURN TRUE; END IF;

  SELECT TRUE INTO v_allowed
  FROM public.company_users cu
  JOIN public.roles r ON r.company_id = cu.company_id AND r.role = cu.role
  JOIN public.role_permissions rp ON rp.company_id = cu.company_id AND rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE cu.profile_id = p_actor_id
    AND cu.company_id = p_company_id
    AND COALESCE(p.is_active, TRUE)
    AND (p.key = p_permission OR p.code = p_permission OR p.name = p_permission)
  LIMIT 1;

  RETURN COALESCE(v_allowed, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.build_sale_change_summary(
  p_old_items JSONB,
  p_new_items JSONB,
  p_total_old NUMERIC,
  p_total_new NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_added JSONB;
  v_removed JSONB;
  v_updated JSONB;
BEGIN
  WITH old_items AS (
    SELECT
      COALESCE(item->>'id', item->>'menu_item_id', item->>'item_id', item->>'name', item->>'item_name') AS key,
      item
    FROM jsonb_array_elements(COALESCE(p_old_items, '[]'::jsonb)) item
  ),
  new_items AS (
    SELECT
      COALESCE(item->>'id', item->>'menu_item_id', item->>'item_id', item->>'name', item->>'item_name') AS key,
      item
    FROM jsonb_array_elements(COALESCE(p_new_items, '[]'::jsonb)) item
  )
  SELECT COALESCE(jsonb_agg(n.item), '[]'::jsonb)
  INTO v_added
  FROM new_items n
  LEFT JOIN old_items o ON o.key = n.key
  WHERE o.key IS NULL;

  WITH old_items AS (
    SELECT
      COALESCE(item->>'id', item->>'menu_item_id', item->>'item_id', item->>'name', item->>'item_name') AS key,
      item
    FROM jsonb_array_elements(COALESCE(p_old_items, '[]'::jsonb)) item
  ),
  new_items AS (
    SELECT
      COALESCE(item->>'id', item->>'menu_item_id', item->>'item_id', item->>'name', item->>'item_name') AS key,
      item
    FROM jsonb_array_elements(COALESCE(p_new_items, '[]'::jsonb)) item
  )
  SELECT COALESCE(jsonb_agg(o.item), '[]'::jsonb)
  INTO v_removed
  FROM old_items o
  LEFT JOIN new_items n ON n.key = o.key
  WHERE n.key IS NULL;

  WITH old_items AS (
    SELECT
      COALESCE(item->>'id', item->>'menu_item_id', item->>'item_id', item->>'name', item->>'item_name') AS key,
      item
    FROM jsonb_array_elements(COALESCE(p_old_items, '[]'::jsonb)) item
  ),
  new_items AS (
    SELECT
      COALESCE(item->>'id', item->>'menu_item_id', item->>'item_id', item->>'name', item->>'item_name') AS key,
      item
    FROM jsonb_array_elements(COALESCE(p_new_items, '[]'::jsonb)) item
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_id', COALESCE(n.item->>'menu_item_id', n.item->>'item_id', n.item->>'id', n.key),
    'item_name', COALESCE(n.item->>'name', n.item->>'item_name', o.item->>'name', o.item->>'item_name'),
    'old_qty', COALESCE((o.item->>'quantity')::NUMERIC, (o.item->>'qty')::NUMERIC, 0),
    'new_qty', COALESCE((n.item->>'quantity')::NUMERIC, (n.item->>'qty')::NUMERIC, 0),
    'old_price', COALESCE((o.item->>'unit_price')::NUMERIC, (o.item->>'price')::NUMERIC, 0),
    'new_price', COALESCE((n.item->>'unit_price')::NUMERIC, (n.item->>'price')::NUMERIC, 0),
    'old_total', COALESCE((o.item->>'total_amount')::NUMERIC, (o.item->>'total_price')::NUMERIC, 0),
    'new_total', COALESCE((n.item->>'total_amount')::NUMERIC, (n.item->>'total_price')::NUMERIC, 0)
  )), '[]'::jsonb)
  INTO v_updated
  FROM old_items o
  JOIN new_items n ON n.key = o.key
  WHERE
    COALESCE((o.item->>'quantity')::NUMERIC, (o.item->>'qty')::NUMERIC, 0) <> COALESCE((n.item->>'quantity')::NUMERIC, (n.item->>'qty')::NUMERIC, 0)
    OR COALESCE((o.item->>'unit_price')::NUMERIC, (o.item->>'price')::NUMERIC, 0) <> COALESCE((n.item->>'unit_price')::NUMERIC, (n.item->>'price')::NUMERIC, 0)
    OR COALESCE((o.item->>'total_amount')::NUMERIC, (o.item->>'total_price')::NUMERIC, 0) <> COALESCE((n.item->>'total_amount')::NUMERIC, (n.item->>'total_price')::NUMERIC, 0);

  RETURN jsonb_build_object(
    'items_added', v_added,
    'items_removed', v_removed,
    'items_updated', v_updated,
    'total_old', COALESCE(p_total_old, 0),
    'total_new', COALESCE(p_total_new, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_invoice(
  p_invoice_id UUID,
  p_new_subtotal NUMERIC,
  p_new_total_tax NUMERIC,
  p_new_grand_total NUMERIC,
  p_new_items JSONB,
  p_edit_reason TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_old_data JSONB;
  v_new_data JSONB;
  v_changed_fields JSONB;
  v_old_items JSONB;
  v_item RECORD;
  v_subtotal NUMERIC := 0;
  v_total_tax NUMERIC := 0;
  v_lines_total NUMERIC := 0;
  v_grand_total NUMERIC := 0;
  v_round_off NUMERIC := 0;
  v_price_changed BOOLEAN := FALSE;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF LENGTH(BTRIM(COALESCE(p_edit_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'Reason for edit is required';
  END IF;
  IF jsonb_typeof(COALESCE(p_new_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invoice items must be a JSON array';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF COALESCE(v_invoice.is_deleted, FALSE) THEN
    RAISE EXCEPTION 'Deleted invoices cannot be edited';
  END IF;
  IF NOT public.sale_actor_has_permission(p_actor_id, v_invoice.company_id, v_invoice.outlet_id, 'sale.edit') THEN
    RAISE EXCEPTION 'Missing permission: sale.edit';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(ii.*) ORDER BY ii.created_at NULLS LAST), '[]'::jsonb)
  INTO v_old_items
  FROM public.invoice_items ii
  WHERE ii.invoice_id = p_invoice_id;

  v_old_data := jsonb_build_object('invoice', to_jsonb(v_invoice), 'items', v_old_items);

  v_changed_fields := public.build_sale_change_summary(v_old_items, p_new_items, v_invoice.grand_total, p_new_grand_total);
  v_price_changed := jsonb_array_length(COALESCE(v_changed_fields->'items_updated', '[]'::jsonb)) > 0
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(v_changed_fields->'items_updated', '[]'::jsonb)) change
      WHERE COALESCE((change->>'old_price')::NUMERIC, 0) <> COALESCE((change->>'new_price')::NUMERIC, 0)
    );

  IF v_price_changed
     AND NOT public.sale_actor_has_permission(p_actor_id, v_invoice.company_id, v_invoice.outlet_id, 'sale.override_price') THEN
    RAISE EXCEPTION 'Missing permission: sale.override_price';
  END IF;

  SELECT
    COALESCE(SUM(COALESCE((item->>'taxable_value')::NUMERIC, (item->>'subtotal')::NUMERIC, (item->>'total_amount')::NUMERIC, 0)), 0),
    COALESCE(SUM(
      COALESCE((item->>'cgst_amount')::NUMERIC, 0)
      + COALESCE((item->>'sgst_amount')::NUMERIC, 0)
      + COALESCE((item->>'igst_amount')::NUMERIC, 0)
      + COALESCE((item->>'tax_amount')::NUMERIC, 0)
    ), 0),
    COALESCE(SUM(COALESCE((item->>'total_amount')::NUMERIC, (item->>'total_price')::NUMERIC, 0)), 0)
  INTO v_subtotal, v_total_tax, v_lines_total
  FROM jsonb_array_elements(COALESCE(p_new_items, '[]'::jsonb)) item;

  v_grand_total := ROUND(v_lines_total);
  v_round_off := v_grand_total - v_lines_total;

  UPDATE public.invoices SET
    subtotal = v_subtotal,
    taxable_value = v_subtotal,
    total_tax = v_total_tax,
    cgst_total = COALESCE((SELECT SUM(COALESCE((item->>'cgst_amount')::NUMERIC, 0)) FROM jsonb_array_elements(p_new_items) item), 0),
    sgst_total = COALESCE((SELECT SUM(COALESCE((item->>'sgst_amount')::NUMERIC, 0)) FROM jsonb_array_elements(p_new_items) item), 0),
    igst_total = COALESCE((SELECT SUM(COALESCE((item->>'igst_amount')::NUMERIC, 0)) FROM jsonb_array_elements(p_new_items) item), 0),
    round_off = v_round_off,
    grand_total = v_grand_total,
    total_amount = v_grand_total,
    is_edited = TRUE,
    edit_reason = BTRIM(p_edit_reason),
    edit_timestamp = NOW(),
    updated_at = NOW(),
    version = COALESCE(version, 1) + 1,
    sync_status = 'synced'
  WHERE id = p_invoice_id;

  PERFORM set_config('papa.bypass_inventory_guard', 'true', true);
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_new_items, '[]'::jsonb)) AS x(
      id UUID,
      menu_item_id UUID,
      item_id UUID,
      name TEXT,
      item_name TEXT,
      quantity NUMERIC,
      qty NUMERIC,
      unit_price NUMERIC,
      price NUMERIC,
      tax_percentage NUMERIC,
      tax_rate NUMERIC,
      taxable_value NUMERIC,
      cgst_amount NUMERIC,
      sgst_amount NUMERIC,
      igst_amount NUMERIC,
      tax_amount NUMERIC,
      total_amount NUMERIC,
      total_price NUMERIC,
      discount_amount NUMERIC,
      selected_modifiers JSONB,
      applied_promotions JSONB
    )
  LOOP
    INSERT INTO public.invoice_items (
      id,
      invoice_id,
      menu_item_id,
      item_name,
      name,
      quantity,
      unit_price,
      tax_percentage,
      tax_amount,
      taxable_value,
      cgst_amount,
      sgst_amount,
      igst_amount,
      total_amount,
      discount_amount,
      selected_modifiers,
      applied_promotions,
      company_id,
      outlet_id,
      sync_status,
      updated_at
    ) VALUES (
      COALESCE(v_item.id, gen_random_uuid()),
      p_invoice_id,
      COALESCE(v_item.menu_item_id, v_item.item_id),
      COALESCE(v_item.item_name, v_item.name),
      COALESCE(v_item.name, v_item.item_name),
      COALESCE(v_item.quantity, v_item.qty, 0),
      COALESCE(v_item.unit_price, v_item.price, CASE WHEN COALESCE(v_item.quantity, v_item.qty, 0) > 0 THEN COALESCE(v_item.total_amount, v_item.total_price, 0) / COALESCE(v_item.quantity, v_item.qty, 1) ELSE 0 END),
      COALESCE(v_item.tax_percentage, v_item.tax_rate, 0),
      COALESCE(v_item.tax_amount, 0),
      COALESCE(v_item.taxable_value, v_item.total_amount, v_item.total_price, 0),
      COALESCE(v_item.cgst_amount, 0),
      COALESCE(v_item.sgst_amount, 0),
      COALESCE(v_item.igst_amount, 0),
      COALESCE(v_item.total_amount, v_item.total_price, 0),
      COALESCE(v_item.discount_amount, 0),
      COALESCE(v_item.selected_modifiers, '[]'::jsonb),
      COALESCE(v_item.applied_promotions, '[]'::jsonb),
      v_invoice.company_id,
      v_invoice.outlet_id,
      'synced',
      NOW()
    );
  END LOOP;

  SELECT jsonb_build_object(
    'invoice', to_jsonb(i.*),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(ii.*)) FROM public.invoice_items ii WHERE ii.invoice_id = i.id), '[]'::jsonb)
  )
  INTO v_new_data
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  v_changed_fields := public.build_sale_change_summary(v_old_items, v_new_data->'items', v_invoice.grand_total, v_grand_total);

  INSERT INTO public.sales_audit_log (
    sale_id, action_type, old_data, new_data, changed_fields, reason, performed_by
  ) VALUES (
    p_invoice_id, 'EDIT', v_old_data, v_new_data, v_changed_fields, BTRIM(p_edit_reason), p_actor_id
  );

  INSERT INTO public.pos_order_audit (order_id, original_data, edited_data, reason, edited_by)
  SELECT p_invoice_id, v_old_data, v_new_data, BTRIM(p_edit_reason), p_actor_id
  WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pos_order_audit');

  UPDATE public.orders SET
    total = v_grand_total,
    "isEdited" = TRUE,
    "editReason" = BTRIM(p_edit_reason),
    "editTimestamp" = NOW(),
    sync_status = 'synced'
  WHERE id = v_invoice.order_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'invoice', v_new_data->'invoice',
    'items', v_new_data->'items',
    'changed_fields', v_changed_fields
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_invoice(
  p_invoice_id UUID,
  p_delete_reason TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_old_data JSONB;
  v_new_data JSONB;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF LENGTH(BTRIM(COALESCE(p_delete_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'Reason for deletion is required';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF COALESCE(v_invoice.is_deleted, FALSE) THEN
    RAISE EXCEPTION 'Invoice is already deleted';
  END IF;
  IF NOT public.sale_actor_has_permission(p_actor_id, v_invoice.company_id, v_invoice.outlet_id, 'sale.delete') THEN
    RAISE EXCEPTION 'Missing permission: sale.delete';
  END IF;

  SELECT jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(ii.*)) FROM public.invoice_items ii WHERE ii.invoice_id = p_invoice_id), '[]'::jsonb)
  )
  INTO v_old_data;

  UPDATE public.invoices SET
    is_deleted = TRUE,
    deleted_at = NOW(),
    updated_at = NOW(),
    sync_status = 'synced'
  WHERE id = p_invoice_id;

  SELECT jsonb_build_object(
    'invoice', to_jsonb(i.*),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(ii.*)) FROM public.invoice_items ii WHERE ii.invoice_id = i.id), '[]'::jsonb)
  )
  INTO v_new_data
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  INSERT INTO public.sales_delete_log (sale_id, deleted_by, reason)
  VALUES (p_invoice_id, p_actor_id, BTRIM(p_delete_reason));

  INSERT INTO public.sales_audit_log (
    sale_id, action_type, old_data, new_data, changed_fields, reason, performed_by
  ) VALUES (
    p_invoice_id,
    'DELETE',
    v_old_data,
    v_new_data,
    jsonb_build_object('is_deleted_old', FALSE, 'is_deleted_new', TRUE, 'deleted_at', NOW()),
    BTRIM(p_delete_reason),
    p_actor_id
  );

  RETURN jsonb_build_object('success', TRUE, 'invoice', v_new_data->'invoice');
END;
$$;

INSERT INTO public.schema_migrations (version, name)
VALUES (105, 'sales_edit_delete_audit')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
