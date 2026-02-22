
-- PAPAPOS MIGRATION 057: INVOICE SCHEMA COMPLIANCE
-- Target: Supabase / Postgres
-- Context: Resolving "column invoices.taxable_value does not exist" and adding audit-ready GST headers.

BEGIN;

-- 1. ADD COMPLIANT COLUMNS
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS taxable_value NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS gst_type TEXT CHECK (gst_type IN ('CGST_SGST', 'IGST')) DEFAULT 'CGST_SGST';

-- 2. DATA BACKFILL (SAFE PRODUCTION MAPPING)
-- Sync legacy subtotal/grand_total to new standardized columns
UPDATE public.invoices
SET 
    taxable_value = COALESCE(taxable_value, subtotal),
    total_amount = COALESCE(total_amount, grand_total),
    gst_type = CASE 
        WHEN igst_amount > 0 THEN 'IGST' 
        ELSE 'CGST_SGST' 
    END
WHERE taxable_value IS NULL OR total_amount IS NULL;

-- 3. ENFORCE CONSTRAINTS
-- Now that data is backfilled, we make these columns mandatory for future integrity
ALTER TABLE public.invoices ALTER COLUMN taxable_value SET NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN total_amount SET NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN gst_type SET NOT NULL;

-- 4. PERFORMANCE INDEXING
CREATE INDEX IF NOT EXISTS idx_invoices_gst_type ON public.invoices(gst_type);
CREATE INDEX IF NOT EXISTS idx_invoices_taxable_lookup ON public.invoices(taxable_value);

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (57, 'invoice_gst_schema_compliance_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

-- Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';

COMMIT;
