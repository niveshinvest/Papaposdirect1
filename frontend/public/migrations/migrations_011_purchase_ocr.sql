
-- PAPAPOS MIGRATION 011: PURCHASE & OCR MODULE
-- Target: Supabase / Postgres

-- 1. SUPPLIERS
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    gstin TEXT,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, name)
);

-- 2. PURCHASE ORDERS (Enhanced/Normalized)
-- Note: Canonical table name is `purchase_orders` for clarity
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'SENT', 'RECEIVED', 'CANCELLED')),
    order_date DATE DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    total_taxable_amount NUMERIC(15,2) DEFAULT 0,
    total_tax_amount NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2) DEFAULT 0,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PURCHASE ITEMS (Line items)
CREATE TABLE IF NOT EXISTS public.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    hsn_code TEXT,
    qty NUMERIC(12,4) NOT NULL,
    unit TEXT,
    unit_price NUMERIC(12,2) NOT NULL,
    tax_percent NUMERIC(5,2) DEFAULT 5.0,
    tax_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PURCHASE INVOICES (Financial Records)
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    purchase_order_id UUID REFERENCES public.purchase_orders(id),
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    supplier_gstin TEXT,
    recipient_gstin TEXT,
    file_url TEXT,
    total_amount NUMERIC(15,2) NOT NULL,
    status TEXT DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PAID', 'PARTIAL')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. OCR INVOICE RESULTS (Staging/Review)
CREATE TABLE IF NOT EXISTS public.ocr_invoice_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    file_name TEXT,
    raw_response JSONB, -- The full Gemini result
    extracted_data JSONB, -- Cleaned JSON structure
    confidence_score NUMERIC(3,2), -- 0.0 to 1.0
    status TEXT DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'PROCESSED', 'REJECTED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RLS POLICIES
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_invoice_results ENABLE ROW LEVEL SECURITY;

-- Suppliers
CREATE POLICY "Suppliers visibility" ON public.suppliers FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Owners manage suppliers" ON public.suppliers FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- Purchase Orders
CREATE POLICY "Purchase orders visibility" ON public.purchase_orders FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Management manage purchase orders" ON public.purchase_orders FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- Purchase Items
CREATE POLICY "Purchase items visibility" ON public.purchase_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = purchase_items.purchase_order_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "Management manage items" ON public.purchase_items FOR ALL USING (EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = purchase_items.purchase_order_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))));

-- Invoices
CREATE POLICY "Invoices visibility" ON public.purchase_invoices FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Management manage invoices" ON public.purchase_invoices FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- OCR Results
CREATE POLICY "OCR results visibility" ON public.ocr_invoice_results FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Management manage OCR" ON public.ocr_invoice_results FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- 7. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (11, 'procurement_ocr_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
