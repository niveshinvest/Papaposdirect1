
-- PAPAPOS MIGRATION 053: PAYMENT MODES GOVERNANCE
-- Target: Supabase / Postgres

BEGIN;

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE payment_mode_type AS ENUM ('CASH', 'DIGITAL', 'CARD', 'SPLIT', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. PAYMENT MODES TABLE
CREATE TABLE IF NOT EXISTS public.payment_modes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type payment_mode_type NOT NULL DEFAULT 'CASH',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    priority_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CONSTRAINT: Exactly one default per outlet
-- We use a partial unique index to enforce that only one record can have is_default = TRUE per outlet
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_payment_mode 
ON public.payment_modes (outlet_id) 
WHERE (is_default = TRUE);

-- 4. SECURITY (RLS)
ALTER TABLE public.payment_modes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payment Modes Visibility" ON public.payment_modes
    FOR SELECT TO authenticated
    USING (company_id = public.get_my_company_id());

CREATE POLICY "Management Payment Control" ON public.payment_modes
    FOR ALL TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN'))
    );

-- 5. INITIAL SEED: Standard modes for existing outlets
-- HARDENED: Only seed for outlets where the company_id exists in the companies table to prevent FK 23503 error
INSERT INTO public.payment_modes (company_id, outlet_id, name, type, is_default, is_active)
SELECT o.company_id, o.id, 'Cash', 'CASH', TRUE, TRUE
FROM public.outlets o
WHERE EXISTS (SELECT 1 FROM public.companies c WHERE c.id = o.company_id)
ON CONFLICT DO NOTHING;

-- 6. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (53, 'payment_modes_governance_v1_fixed')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

-- Refresh PostgREST cache to prevent "Could not find table" error
NOTIFY pgrst, 'reload schema';

COMMIT;
