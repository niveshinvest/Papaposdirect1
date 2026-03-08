
-- PAPAPOS MIGRATION 012: SALES & BILLING MODULE
-- Target: Supabase / Postgres

-- 1. EXTEND ORDERS TABLE (Adding missing multi-tenant fields)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

-- 2. ORDER ITEMS (Normalized Line Items)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    menu_item_id TEXT, -- Logical link
    name TEXT NOT NULL,
    qty NUMERIC(12,3) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    tax_rate NUMERIC(5,2) DEFAULT 5.00,
    tax_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BILLS (Financial Document)
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    invoice_no TEXT NOT NULL,
    bill_date TIMESTAMPTZ DEFAULT NOW(),
    subtotal NUMERIC(15,2) NOT NULL,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    total_tax NUMERIC(15,2) NOT NULL,
    grand_total NUMERIC(15,2) NOT NULL,
    place_of_supply TEXT, -- State Code (e.g. '27')
    is_inter_state BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, invoice_no)
);

-- 4. BILL TAXES (Tax Breakdown for GSTR-1)
CREATE TABLE IF NOT EXISTS public.bill_taxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    tax_type TEXT NOT NULL CHECK (tax_type IN ('CGST', 'SGST', 'IGST')),
    rate NUMERIC(5,2) NOT NULL,
    amount NUMERIC(12,2) NOT NULL
);

-- 5. PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    payment_method TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    transaction_ref TEXT,
    status TEXT DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RLS POLICIES
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_taxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Shared visibility for company members
CREATE POLICY "Sales visibility" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders WHERE id = order_items.order_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "Sales visibility" ON public.bills FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Sales visibility" ON public.bill_taxes FOR SELECT USING (EXISTS (SELECT 1 FROM public.bills WHERE id = bill_taxes.bill_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "Sales visibility" ON public.payments FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Write policies for management and cashiers
CREATE POLICY "Sales entry" ON public.order_items FOR ALL USING (EXISTS (SELECT 1 FROM public.orders WHERE id = order_items.order_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "Sales entry" ON public.bills FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Sales entry" ON public.bill_taxes FOR ALL USING (EXISTS (SELECT 1 FROM public.bills WHERE id = bill_taxes.bill_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "Sales entry" ON public.payments FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_bills_outlet ON public.bills(outlet_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON public.payments(bill_id);

-- 8. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (12, 'sales_billing_normalized_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
