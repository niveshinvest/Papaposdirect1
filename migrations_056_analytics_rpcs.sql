
-- PAPAPOS MIGRATION 056: ANALYTICS & COMPLIANCE RPCS
-- Target: Supabase / Postgres

BEGIN;

-- 1. RPC: TOP SELLING ITEMS
CREATE OR REPLACE FUNCTION public.get_top_selling_items(
    p_company_id UUID,
    p_outlet_id TEXT,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_limit INTEGER
)
RETURNS TABLE (
    name TEXT,
    quantity NUMERIC,
    revenue NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.name,
        SUM(ii.quantity) as quantity,
        SUM(ii.total_amount) as revenue
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    JOIN public.menu_items m ON ii.menu_item_id = m.id
    WHERE i.company_id = p_company_id
    AND (p_outlet_id IS NULL OR i.outlet_id = p_outlet_id)
    AND i.created_at >= p_start_date
    AND i.created_at <= p_end_date
    GROUP BY m.name
    ORDER BY SUM(ii.total_amount) DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RPC: HSN SUMMARY
CREATE OR REPLACE FUNCTION public.get_hsn_summary(
    p_company_id UUID,
    p_outlet_id TEXT,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
    hsn_code TEXT,
    tax_rate NUMERIC,
    taxable_value NUMERIC,
    cgst NUMERIC,
    sgst NUMERIC,
    igst NUMERIC,
    total_tax NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.hsn_code,
        m.tax_percentage as tax_rate,
        SUM(ii.taxable_value) as taxable_value,
        SUM(ii.cgst_amount) as cgst,
        SUM(ii.sgst_amount) as sgst,
        SUM(ii.igst_amount) as igst,
        SUM(ii.cgst_amount + ii.sgst_amount + ii.igst_amount) as total_tax
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    JOIN public.menu_items m ON ii.menu_item_id = m.id
    WHERE i.company_id = p_company_id
    AND (p_outlet_id IS NULL OR i.outlet_id = p_outlet_id)
    AND i.created_at >= p_start_date
    AND i.created_at <= p_end_date
    GROUP BY m.hsn_code, m.tax_percentage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (56, 'analytics_hsn_top_rpcs_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
