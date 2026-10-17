-- PAPAPOS MIGRATION 093: DISCOUNTS, OFFERS, COMBOS ENGINE
-- Target: Supabase / Postgres

DO $$ BEGIN
    CREATE TYPE public.discount_scope AS ENUM ('ORDER', 'ITEM', 'CATEGORY', 'CUSTOMER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.promotion_value_type AS ENUM ('FLAT', 'PERCENTAGE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.offer_type AS ENUM ('BOGO', 'BUY_X_GET_Y', 'FREE_ADDON', 'PERCENTAGE', 'FLAT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.combo_type AS ENUM ('FIXED', 'BUILD_YOUR_OWN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.combo_group_mode AS ENUM ('FIXED', 'CHOICE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.promotion_source_kind AS ENUM ('DISCOUNT', 'OFFER', 'COMBO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.discount_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    max_manual_discount_percent NUMERIC(6,2) NOT NULL DEFAULT 20,
    allowed_manual_discount_types TEXT[] NOT NULL DEFAULT ARRAY['FLAT', 'PERCENTAGE'],
    allow_cashier_manual_discount BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, outlet_id)
);

CREATE TABLE IF NOT EXISTS public.discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auto_apply BOOLEAN NOT NULL DEFAULT TRUE,
    scope public.discount_scope NOT NULL DEFAULT 'ORDER',
    value_type public.promotion_value_type NOT NULL DEFAULT 'PERCENTAGE',
    value NUMERIC(12,2) NOT NULL DEFAULT 0,
    min_order_amount NUMERIC(12,2) DEFAULT 0,
    max_discount_amount NUMERIC(12,2),
    category_filters TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    item_filters UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    customer_filters TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    start_date DATE,
    end_date DATE,
    start_time TIME,
    end_time TIME,
    days_of_week INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    priority INTEGER NOT NULL DEFAULT 200,
    stack_mode TEXT NOT NULL DEFAULT 'ORDER_LEVEL',
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type public.offer_type NOT NULL DEFAULT 'BOGO',
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auto_apply BOOLEAN NOT NULL DEFAULT TRUE,
    start_date DATE,
    end_date DATE,
    start_time TIME,
    end_time TIME,
    days_of_week INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    priority INTEGER NOT NULL DEFAULT 300,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.offer_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
    buy_quantity INTEGER DEFAULT 1,
    reward_quantity INTEGER DEFAULT 1,
    item_filters UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    category_filters TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    min_order_amount NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.offer_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
    item_filters UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    category_filters TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    discount_type TEXT NOT NULL DEFAULT 'FREE',
    discount_value NUMERIC(12,2) DEFAULT 0,
    add_on_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.combos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    type public.combo_type NOT NULL DEFAULT 'FIXED',
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auto_apply BOOLEAN NOT NULL DEFAULT FALSE,
    start_date DATE,
    end_date DATE,
    start_time TIME,
    end_time TIME,
    days_of_week INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    priority INTEGER NOT NULL DEFAULT 400,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.combo_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    combo_id UUID NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    mode public.combo_group_mode NOT NULL DEFAULT 'FIXED',
    required_quantity INTEGER NOT NULL DEFAULT 1,
    item_filters UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    category_filters TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    fixed_items UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.promotion_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
    source_kind public.promotion_source_kind NOT NULL,
    source_id UUID,
    source_name TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    savings_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    revenue_impact NUMERIC(12,2) NOT NULL DEFAULT 0,
    avg_order_value_lift NUMERIC(12,2) NOT NULL DEFAULT 0,
    usage_count INTEGER NOT NULL DEFAULT 1,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS savings_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS promotion_summary JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.invoice_items
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS applied_promotions JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS combo_id UUID,
    ADD COLUMN IF NOT EXISTS combo_instance_id UUID,
    ADD COLUMN IF NOT EXISTS combo_group_id UUID,
    ADD COLUMN IF NOT EXISTS combo_label TEXT;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS savings_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS promotion_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE INDEX IF NOT EXISTS idx_discounts_company_outlet_active ON public.discounts(company_id, outlet_id, is_active);
CREATE INDEX IF NOT EXISTS idx_offers_company_outlet_active ON public.offers(company_id, outlet_id, is_active);
CREATE INDEX IF NOT EXISTS idx_combos_company_outlet_active ON public.combos(company_id, outlet_id, is_active);
CREATE INDEX IF NOT EXISTS idx_promotion_usage_company_outlet_created ON public.promotion_usage(company_id, outlet_id, created_at DESC);

ALTER TABLE public.discount_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Promotion settings visibility" ON public.discount_settings;
CREATE POLICY "Promotion settings visibility" ON public.discount_settings
    FOR SELECT TO authenticated
    USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Promotion settings management" ON public.discount_settings;
CREATE POLICY "Promotion settings management" ON public.discount_settings
    FOR ALL TO authenticated
    USING (company_id = public.get_my_company_id())
    WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Discount visibility" ON public.discounts;
CREATE POLICY "Discount visibility" ON public.discounts
    FOR SELECT TO authenticated
    USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Discount management" ON public.discounts;
CREATE POLICY "Discount management" ON public.discounts
    FOR ALL TO authenticated
    USING (company_id = public.get_my_company_id())
    WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Offer visibility" ON public.offers;
CREATE POLICY "Offer visibility" ON public.offers
    FOR SELECT TO authenticated
    USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Offer management" ON public.offers;
CREATE POLICY "Offer management" ON public.offers
    FOR ALL TO authenticated
    USING (company_id = public.get_my_company_id())
    WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Offer condition visibility" ON public.offer_conditions;
CREATE POLICY "Offer condition visibility" ON public.offer_conditions
    FOR SELECT TO authenticated
    USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Offer condition management" ON public.offer_conditions;
CREATE POLICY "Offer condition management" ON public.offer_conditions
    FOR ALL TO authenticated
    USING (company_id = public.get_my_company_id())
    WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Offer reward visibility" ON public.offer_rewards;
CREATE POLICY "Offer reward visibility" ON public.offer_rewards
    FOR SELECT TO authenticated
    USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Offer reward management" ON public.offer_rewards;
CREATE POLICY "Offer reward management" ON public.offer_rewards
    FOR ALL TO authenticated
    USING (company_id = public.get_my_company_id())
    WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Combo visibility" ON public.combos;
CREATE POLICY "Combo visibility" ON public.combos
    FOR SELECT TO authenticated
    USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Combo management" ON public.combos;
CREATE POLICY "Combo management" ON public.combos
    FOR ALL TO authenticated
    USING (company_id = public.get_my_company_id())
    WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Combo item visibility" ON public.combo_items;
CREATE POLICY "Combo item visibility" ON public.combo_items
    FOR SELECT TO authenticated
    USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Combo item management" ON public.combo_items;
CREATE POLICY "Combo item management" ON public.combo_items
    FOR ALL TO authenticated
    USING (company_id = public.get_my_company_id())
    WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Promotion usage visibility" ON public.promotion_usage;
CREATE POLICY "Promotion usage visibility" ON public.promotion_usage
    FOR SELECT TO authenticated
    USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Promotion usage management" ON public.promotion_usage;
CREATE POLICY "Promotion usage management" ON public.promotion_usage
    FOR ALL TO authenticated
    USING (company_id = public.get_my_company_id())
    WITH CHECK (company_id = public.get_my_company_id());

INSERT INTO public.schema_migrations (version, name)
VALUES (93, 'promotions_engine_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
