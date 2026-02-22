
-- PAPAPOS MIGRATION 038: INDIAN GST COMPLIANCE CORE
-- Target: Supabase / Postgres

BEGIN;

-- 1. EXTEND MASTER DATA TABLES
ALTER TABLE public.outlets 
ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS gst_number TEXT,
ADD COLUMN IF NOT EXISTS gst_registered BOOLEAN DEFAULT TRUE;

ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS hsn_code TEXT DEFAULT '9963',
ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS is_tax_inclusive BOOLEAN DEFAULT TRUE;

-- 2. CREATE INVOICES (GST COMPLIANT PRIMARY)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    order_id TEXT UNIQUE, -- 1:1 with POS session
    invoice_number TEXT NOT NULL, -- Format: CODE/FY/SEQ
    billing_state_code TEXT NOT NULL,
    outlet_state_code TEXT NOT NULL,
    subtotal NUMERIC(15,2) NOT NULL,
    cgst_amount NUMERIC(12,2) DEFAULT 0,
    sgst_amount NUMERIC(12,2) DEFAULT 0,
    igst_amount NUMERIC(12,2) DEFAULT 0,
    total_tax NUMERIC(15,2) NOT NULL,
    round_off NUMERIC(5,2) DEFAULT 0,
    grand_total NUMERIC(15,2) NOT NULL,
    payment_method TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, invoice_number)
);

-- 3. CREATE INVOICE ITEMS (GST LINE AUDIT)
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
    quantity NUMERIC(12,3) NOT NULL,
    taxable_value NUMERIC(15,2) NOT NULL,
    cgst_amount NUMERIC(12,2) DEFAULT 0,
    sgst_amount NUMERIC(12,2) DEFAULT 0,
    igst_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL
);

-- 4. INVOICE SEQUENCE MANAGEMENT (FOR FY RESET)
CREATE TABLE IF NOT EXISTS public.invoice_sequences (
    outlet_id TEXT PRIMARY KEY REFERENCES public.outlets(id),
    financial_year TEXT NOT NULL, -- e.g. '24-25'
    current_value INTEGER DEFAULT 0,
    UNIQUE(outlet_id, financial_year)
);

-- 5. FUNCTION: GET FY STRING
CREATE OR REPLACE FUNCTION public.get_current_fy()
RETURNS TEXT AS $$
DECLARE
    v_year INTEGER;
    v_month INTEGER;
BEGIN
    v_year := EXTRACT(YEAR FROM NOW());
    v_month := EXTRACT(MONTH FROM NOW());
    
    -- Indian FY starts April 1st
    IF v_month < 4 THEN
        RETURN FORMAT('%s-%s', (v_year - 1) % 100, v_year % 100);
    ELSE
        RETURN FORMAT('%s-%s', v_year % 100, (v_year + 1) % 100);
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- 6. RPC: GET NEXT INVOICE NUMBER
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(p_outlet_id TEXT)
RETURNS TEXT AS $$
DECLARE
    v_fy TEXT;
    v_code TEXT;
    v_seq INTEGER;
BEGIN
    v_fy := public.get_current_fy();
    
    SELECT short_code INTO v_code FROM public.outlets WHERE id = p_outlet_id;
    IF v_code IS NULL THEN v_code := 'INV'; END IF;

    INSERT INTO public.invoice_sequences (outlet_id, financial_year, current_value)
    VALUES (p_outlet_id, v_fy, 1)
    ON CONFLICT (outlet_id) DO UPDATE 
    SET current_value = 
        CASE 
            WHEN invoice_sequences.financial_year = EXCLUDED.financial_year THEN invoice_sequences.current_value + 1
            ELSE 1 
        END,
        financial_year = EXCLUDED.financial_year
    RETURNING current_value INTO v_seq;

    RETURN FORMAT('%s/%s/%s', v_code, v_fy, LPAD(v_seq::text, 6, '0'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. SECURITY (RLS)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Isolation" ON public.invoices FOR ALL TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "Line Isolation" ON public.invoice_items FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.invoices WHERE id = invoice_items.invoice_id AND company_id = public.get_my_company_id())
);

-- 8. AUDIT PROTECTION: NO DELETES ON INVOICES
CREATE OR REPLACE FUNCTION public.prevent_invoice_deletion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Invoice deletion prohibited for GST compliance. Use Credit Notes instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_lock_invoices
    BEFORE DELETE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.prevent_invoice_deletion();

-- 9. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (38, 'gst_compliance_india_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
