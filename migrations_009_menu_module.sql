
-- PAPAPOS MIGRATION 009: MENU MODULE
-- Target: Supabase / Postgres

-- 1. MENU CATEGORIES
CREATE TABLE IF NOT EXISTS public.menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. MENU ITEMS
CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_veg BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. MENU VARIANTS
CREATE TABLE IF NOT EXISTS public.menu_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_override NUMERIC(12,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. MENU ADDONS
CREATE TABLE IF NOT EXISTS public.menu_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. OUTLET MENU PRICING
CREATE TABLE IF NOT EXISTS public.outlet_menu_pricing (
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    price NUMERIC(12,2),
    is_available BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (outlet_id, menu_item_id)
);

-- 6. RLS POLICIES
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_menu_pricing ENABLE ROW LEVEL SECURITY;

-- CATEGORIES
CREATE POLICY "Menu categories visibility" ON public.menu_categories
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Management manage categories" ON public.menu_categories
    FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- ITEMS
CREATE POLICY "Menu items visibility" ON public.menu_items
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Management manage items" ON public.menu_items
    FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- VARIANTS
CREATE POLICY "Menu variants visibility" ON public.menu_variants
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.menu_items WHERE id = menu_variants.menu_item_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Management manage variants" ON public.menu_variants
    FOR ALL USING (EXISTS (SELECT 1 FROM public.menu_items WHERE id = menu_variants.menu_item_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))));

-- ADDONS
CREATE POLICY "Menu addons visibility" ON public.menu_addons
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.menu_items WHERE id = menu_addons.menu_item_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Management manage addons" ON public.menu_addons
    FOR ALL USING (EXISTS (SELECT 1 FROM public.menu_items WHERE id = menu_addons.menu_item_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))));

-- OUTLET PRICING
CREATE POLICY "Outlet pricing visibility" ON public.outlet_menu_pricing
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.outlets WHERE id = outlet_menu_pricing.outlet_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Management manage outlet pricing" ON public.outlet_menu_pricing
    FOR ALL USING (EXISTS (SELECT 1 FROM public.outlets WHERE id = outlet_menu_pricing.outlet_id AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))));

-- 7. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (9, 'menu_module_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
