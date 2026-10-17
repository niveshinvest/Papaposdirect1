
-- PAPAPOS MIGRATION 024: STRICT OPERATIONAL ISOLATION
-- Target: Supabase / Postgres
-- Description: Adds outlet_id and company_id to all operational tables with hardened RLS.

-- 1. MENU MODULE ISOLATION
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);

-- 2. RECIPE MODULE ISOLATION
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);

-- 3. CRM & WHATSAPP ISOLATION
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_logs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_logs ADD COLUMN IF NOT EXISTS outlet_id TEXT REFERENCES public.outlets(id);

-- 4. ENABLE HARDENED RLS POLICIES
-- Using security helper public.get_my_company_id() to break recursion
DO $$ 
DECLARE 
    t text;
    ops_tables text[] := ARRAY[
        'menu_items', 'menu_categories', 'inventory_batches', 
        'inventory_ledger', 'purchase_orders', 'recipes',
        'kitchen_orders', 'delivery_partner_prices', 'bills',
        'orders', 'order_items', 'customers', 'whatsapp_logs'
    ];
BEGIN
    FOREACH t IN ARRAY ops_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Outlet Isolation" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Outlet Isolation" ON public.%I FOR ALL TO authenticated USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id())', t);
    END LOOP;
END $$;

-- 5. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_menu_items_outlet_v2 ON public.menu_items(outlet_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_outlet_v2 ON public.inventory_ledger(outlet_id);
CREATE INDEX IF NOT EXISTS idx_orders_outlet_v2 ON public.orders(outlet_id);

-- 6. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (24, 'operational_isolation_v2')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
