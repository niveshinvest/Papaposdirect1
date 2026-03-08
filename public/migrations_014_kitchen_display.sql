
-- PAPAPOS MIGRATION 014: KITCHEN DISPLAY MODULE
-- Target: Supabase / Postgres

-- 1. KITCHEN ORDERS (Cloud Preparation Tickets)
CREATE TABLE IF NOT EXISTS public.kitchen_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    order_id TEXT NOT NULL, -- Logical link to billing order
    table_name TEXT DEFAULT 'Takeaway',
    items JSONB NOT NULL, -- Array of {name, qty, notes}
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED')),
    priority TEXT DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'URGENT', 'VIP')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. KITCHEN STATUS LOGS (Audit trail for efficiency reports)
CREATE TABLE IF NOT EXISTS public.kitchen_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kitchen_order_id UUID NOT NULL REFERENCES public.kitchen_orders(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    status_from TEXT,
    status_to TEXT NOT NULL,
    user_id UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS POLICIES
ALTER TABLE public.kitchen_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_status_logs ENABLE ROW LEVEL SECURITY;

-- Shared visibility for all company staff (Kitchen + Managers)
CREATE POLICY "Kitchen visibility" ON public.kitchen_orders 
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Kitchen management" ON public.kitchen_orders 
    FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Status logs visibility
CREATE POLICY "Kitchen logs visibility" ON public.kitchen_status_logs 
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Kitchen logs recording" ON public.kitchen_status_logs 
    FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_kitchen_active ON public.kitchen_orders(outlet_id, status) WHERE status NOT IN ('SERVED', 'CANCELLED');
CREATE INDEX IF NOT EXISTS idx_kitchen_order_link ON public.kitchen_orders(order_id);

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (14, 'kitchen_display_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
