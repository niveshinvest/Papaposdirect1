
-- PAPAPOS MIGRATION 010: INVENTORY MODULE
-- Target: Supabase / Postgres

-- 1. INVENTORY BATCHES (Tracking specific lots)
CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    item_id TEXT NOT NULL, -- Logical link to inventory item name/metadata
    batch_code TEXT,
    initial_qty NUMERIC(12,4) NOT NULL,
    current_qty NUMERIC(12,4) NOT NULL,
    cost_price NUMERIC(12,2) DEFAULT 0,
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. INVENTORY LEDGER (Audit Trail of all movements)
CREATE TABLE IF NOT EXISTS public.inventory_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    item_id TEXT NOT NULL,
    batch_id UUID REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('STOCK_IN', 'STOCK_OUT', 'WASTAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'SALE')),
    qty_change NUMERIC(12,4) NOT NULL,
    balance_after NUMERIC(12,4) NOT NULL,
    reason TEXT,
    user_id UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. INVENTORY WASTAGE
CREATE TABLE IF NOT EXISTS public.inventory_wastage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    item_id TEXT NOT NULL,
    batch_id UUID REFERENCES public.inventory_batches(id),
    qty NUMERIC(12,4) NOT NULL,
    reason TEXT NOT NULL, -- e.g., 'SPOILAGE', 'BREAKAGE', 'EXPIRED'
    recorded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. INVENTORY TRANSFERS
CREATE TABLE IF NOT EXISTS public.inventory_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    from_outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    to_outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
    items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {item_id, qty, batch_id}
    dispatched_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RLS POLICIES
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_wastage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;

-- Shared visibility policy for company members
CREATE POLICY "Inventory visibility" ON public.inventory_batches FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Inventory visibility" ON public.inventory_ledger FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Inventory visibility" ON public.inventory_wastage FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Inventory visibility" ON public.inventory_transfers FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Management write policy
CREATE POLICY "Management manage inventory" ON public.inventory_batches FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));
CREATE POLICY "Management manage inventory" ON public.inventory_ledger FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));
CREATE POLICY "Management manage inventory" ON public.inventory_wastage FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));
CREATE POLICY "Management manage inventory" ON public.inventory_transfers FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- 6. INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_ledger_item_outlet ON public.inventory_ledger(item_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON public.inventory_batches(expiry_date) WHERE expiry_date IS NOT NULL;

-- 7. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (10, 'inventory_ledger_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
