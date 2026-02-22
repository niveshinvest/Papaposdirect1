
-- PAPAPOS MIGRATION 046: DASHBOARD LIVE AGGREGATIONS
-- Target: Supabase / Postgres

BEGIN;

-- 1. COMPREHENSIVE BUSINESS SUMMARY RPC
CREATE OR REPLACE FUNCTION public.get_business_summary(
    p_company_id UUID,
    p_outlet_id TEXT,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
    v_total_sales NUMERIC;
    v_net_sales NUMERIC;
    v_order_count INTEGER;
    v_total_tax NUMERIC;
    v_total_taxable NUMERIC;
    v_payment_splits JSONB;
    v_gst_breakup JSONB;
    v_p_outlet_id TEXT := p_outlet_id;
BEGIN
    -- Base Aggregates
    SELECT 
        COALESCE(SUM(grand_total), 0),
        COALESCE(SUM(taxable_value), 0),
        COALESCE(SUM(total_tax), 0),
        COUNT(*)
    INTO v_total_sales, v_total_taxable, v_total_tax, v_order_count
    FROM public.invoices
    WHERE company_id = p_company_id
    AND (v_p_outlet_id IS NULL OR outlet_id = v_p_outlet_id)
    AND created_at >= p_start_date
    AND created_at <= p_end_date;

    -- Payment Type Split
    SELECT jsonb_object_agg(payment_method, count)
    INTO v_payment_splits
    FROM (
        SELECT payment_method, COUNT(*) as count
        FROM public.invoices
        WHERE company_id = p_company_id
        AND (v_p_outlet_id IS NULL OR outlet_id = v_p_outlet_id)
        AND created_at >= p_start_date
        AND created_at <= p_end_date
        GROUP BY payment_method
    ) s;

    -- Return Identity Packet
    RETURN jsonb_build_object(
        'gross_sales', v_total_sales,
        'taxable_value', v_total_taxable,
        'total_tax', v_total_tax,
        'order_count', v_order_count,
        'payment_splits', COALESCE(v_payment_splits, '{}'::jsonb),
        'timestamp', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (46, 'dashboard_live_aggregations_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
