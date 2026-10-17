-- Migration: 204_ai_insights.sql
-- Purpose: Add RPCs used by the AI insights engine (fast moving, dead stock, low stock, expiry, supplier price comparison)

BEGIN;

-- 1) Fast moving items: top sold items over a period
CREATE OR REPLACE FUNCTION public.get_fast_moving_items(p_company uuid, p_outlet text, p_days integer DEFAULT 30, p_limit integer DEFAULT 20)
RETURNS TABLE(menu_item_id uuid, name text, total_quantity numeric) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ii.menu_item_id, m.name, SUM(ii.quantity) AS total_quantity
  FROM public.invoice_items ii
  JOIN public.invoices i ON i.id = ii.invoice_id
  LEFT JOIN public.menu_items m ON m.id = ii.menu_item_id
  WHERE (p_company IS NULL OR i.company_id = p_company)
    AND (p_outlet IS NULL OR i.outlet_id::text = p_outlet)
    AND i.created_at >= (now() - (p_days || ' days')::interval)
  GROUP BY ii.menu_item_id, m.name
  ORDER BY total_quantity DESC
  LIMIT p_limit;
$$;

-- 2) Dead stock: items with stock > 0 but no sales in last N days
CREATE OR REPLACE FUNCTION public.get_dead_stock(p_company uuid, p_outlet text, p_days integer DEFAULT 90, p_limit integer DEFAULT 100)
RETURNS TABLE(item_id text, item_name text, qty_available numeric, last_sold timestamptz) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT b.item_id, itm.name AS item_name, SUM(b.qty_available) AS qty_available, MAX(i.created_at) AS last_sold
  FROM public.inventory_batches b
  JOIN public.items itm ON itm.id = b.item_id
  LEFT JOIN public.invoice_items ii ON ii.menu_item_id::text = itm.id::text
  LEFT JOIN public.invoices i ON i.id = ii.invoice_id
  WHERE (p_outlet IS NULL OR b.outlet_id::text = p_outlet)
  GROUP BY b.item_id, itm.name
  HAVING SUM(b.qty_available) > 0 AND (MAX(i.created_at) IS NULL OR MAX(i.created_at) < (now() - (p_days || ' days')::interval))
  ORDER BY qty_available DESC
  LIMIT p_limit;
$$;

-- 3) Low stock alerts
CREATE OR REPLACE FUNCTION public.get_low_stock(p_company uuid, p_outlet text, p_limit integer DEFAULT 100)
RETURNS TABLE(item_id text, item_name text, outlet_id text, qty_available numeric, reorder_level numeric) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT s.item_id, itm.name AS item_name, s.outlet_id, s.qty_available, itm.reorder_level
  FROM public.inventory_stock_summary s
  JOIN public.items itm ON itm.id = s.item_id
  WHERE (p_outlet IS NULL OR s.outlet_id::text = p_outlet)
    AND s.qty_available <= COALESCE(itm.reorder_level, itm.min_stock_level)
  ORDER BY s.qty_available ASC
  LIMIT p_limit;
$$;

-- 4) Expiry alerts: batches expiring in next N days
CREATE OR REPLACE FUNCTION public.get_expiry_alerts(p_outlet text, p_days integer DEFAULT 30, p_limit integer DEFAULT 200)
RETURNS TABLE(batch_id uuid, item_id text, item_name text, expiry_date date, qty_available numeric, outlet_id text) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT b.id AS batch_id, b.item_id, itm.name AS item_name, b.expiry_date, b.qty_available, b.outlet_id
  FROM public.inventory_batches b
  JOIN public.items itm ON itm.id = b.item_id
  WHERE b.expiry_date IS NOT NULL
    AND b.expiry_date <= (now() + (p_days || ' days')::interval)::date
    AND (p_outlet IS NULL OR b.outlet_id::text = p_outlet)
  ORDER BY b.expiry_date ASC
  LIMIT p_limit;
$$;

-- 5) Supplier price comparison: returns supplier-wise average cost for an item
CREATE OR REPLACE FUNCTION public.get_supplier_price_comparison(p_item text, p_limit integer DEFAULT 20)
RETURNS TABLE(supplier_id uuid, supplier_name text, avg_cost numeric, last_purchase date) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT po.supplier_id, s.name AS supplier_name, AVG(pi.cost_price) AS avg_cost, MAX(po.purchase_date) AS last_purchase
  FROM public.purchase_items pi
  JOIN public.purchase_orders po ON po.id = pi.purchase_id
  LEFT JOIN public.suppliers s ON s.id = po.supplier_id
  WHERE pi.item_id = p_item
  GROUP BY po.supplier_id, s.name
  ORDER BY last_purchase DESC
  LIMIT p_limit;
$$;

-- Record migration
INSERT INTO public.schema_migrations (version, name) VALUES (204, 'ai_insights_rpcs') ON CONFLICT (version) DO NOTHING;

COMMIT;
