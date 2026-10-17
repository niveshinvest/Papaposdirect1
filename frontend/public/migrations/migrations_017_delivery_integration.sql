
-- PAPAPOS MIGRATION 017: DELIVERY PARTNER MODULE
-- Target: Supabase / Postgres

-- 1. DELIVERY PARTNERS (Registry)
CREATE TABLE IF NOT EXISTS public.delivery_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., 'ZOMATO', 'SWIGGY', 'DUNZO'
    logo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. OUTLET DELIVERY CONFIG (Credential & Status storage)
CREATE TABLE IF NOT EXISTS public.outlet_delivery_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    partner_id UUID NOT NULL REFERENCES public.delivery_partners(id),
    external_store_id TEXT,
    is_online BOOLEAN DEFAULT FALSE,
    integration_config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(outlet_id, partner_id)
);

-- 3. PRICING OVERRIDE ENGINE (Channel-specific pricing)
CREATE TABLE IF NOT EXISTS public.delivery_partner_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    partner_id UUID NOT NULL REFERENCES public.delivery_partners(id),
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    override_price NUMERIC(12,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(outlet_id, partner_id, menu_item_id)
);

-- 4. DELIVERY ORDERS (Marketplace Transactions)
CREATE TABLE IF NOT EXISTS public.delivery_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    partner_id UUID NOT NULL REFERENCES public.delivery_partners(id),
    external_order_id TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'DELIVERED', 'CANCELLED')),
    customer_name TEXT,
    subtotal NUMERIC(15,2) NOT NULL,
    total_tax NUMERIC(15,2) NOT NULL,
    total_discount NUMERIC(15,2) DEFAULT 0,
    grand_total NUMERIC(15,2) NOT NULL,
    estimated_commission NUMERIC(15,2) DEFAULT 0,
    estimated_payout NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. DELIVERY ORDER ITEMS (Transparent Pricing Audit)
CREATE TABLE IF NOT EXISTS public.delivery_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.delivery_orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
    item_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    base_menu_price NUMERIC(12,2), -- The walk-in price at the time of order
    charged_price NUMERIC(12,2) NOT NULL, -- The price the customer actually paid on the app
    total_amount NUMERIC(15,2) NOT NULL
);

-- 6. RLS POLICIES
ALTER TABLE public.delivery_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_delivery_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_partner_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery visibility" ON public.delivery_partners FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Delivery visibility" ON public.outlet_delivery_partners FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Delivery visibility" ON public.delivery_partner_prices FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Delivery visibility" ON public.delivery_orders FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Delivery management" ON public.delivery_partner_prices FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));
CREATE POLICY "Delivery management" ON public.outlet_delivery_partners FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_delivery_price_lookup ON public.delivery_partner_prices(outlet_id, partner_id, menu_item_id);
CREATE INDEX IF NOT EXISTS idx_delivery_order_ext ON public.delivery_orders(external_order_id, partner_id);

-- 8. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (17, 'delivery_pricing_engine_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
