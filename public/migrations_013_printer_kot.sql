
-- PAPAPOS MIGRATION 013: PRINTER & KOT MODULE
-- Target: Supabase / Postgres

-- 1. PRINTERS (Enhanced Hardware Registry)
-- We drop the legacy 'printers' if it exists to ensure UUID and multi-tenant consistency
DROP TABLE IF EXISTS public.printers CASCADE;
CREATE TABLE public.printers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('BILL', 'KOT', 'BOTH')),
    interface TEXT NOT NULL CHECK (interface IN ('NETWORK', 'USB', 'BLUETOOTH')),
    address TEXT NOT NULL, -- IP or Port
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PRINTER ROUTES (Category-to-Hardware Mapping)
CREATE TABLE IF NOT EXISTS public.printer_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    printer_id UUID NOT NULL REFERENCES public.printers(id) ON DELETE CASCADE,
    category_name TEXT NOT NULL, -- e.g. 'Starters', 'Drinks'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(outlet_id, category_name)
);

-- 3. KOT TEMPLATES (Custom Print Formats)
CREATE TABLE IF NOT EXISTS public.kot_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    header_text TEXT,
    footer_text TEXT,
    show_order_timer BOOLEAN DEFAULT TRUE,
    font_size TEXT DEFAULT 'MEDIUM',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS POLICIES
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printer_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kot_templates ENABLE ROW LEVEL SECURITY;

-- Printers
CREATE POLICY "Printers visibility" ON public.printers FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Management manage printers" ON public.printers FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- Routes
CREATE POLICY "Routes visibility" ON public.printer_routes FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Management manage routes" ON public.printer_routes FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- Templates
CREATE POLICY "Templates visibility" ON public.kot_templates FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Management manage templates" ON public.kot_templates FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- 5. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_printers_outlet ON public.printers(outlet_id);
CREATE INDEX IF NOT EXISTS idx_routes_category ON public.printer_routes(category_name);

-- 6. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (13, 'printer_kot_routing_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
