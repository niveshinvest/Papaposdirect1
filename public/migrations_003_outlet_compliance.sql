
-- PAPAPOS MIGRATION 003: OUTLET COMPLIANCE & MULTI-TENANCY
-- Target: Supabase / Postgres

-- 1. ENHANCE OUTLETS TABLE
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT auth.uid();
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS state_code TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.outlets ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT; -- Match case used in frontend

-- 2. CREATE NORMALIZED GST TABLE
CREATE TABLE IF NOT EXISTS public.outlet_gst (
    outlet_id TEXT PRIMARY KEY REFERENCES public.outlets(id) ON DELETE CASCADE,
    gstin TEXT NOT NULL,
    legal_name TEXT,
    registration_type TEXT CHECK (registration_type IN ('REGULAR', 'COMPOSITION', 'CONSUMER')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_gst ENABLE ROW LEVEL SECURITY;

-- 4. MULTI-TENANT POLICIES (Isolation via company_id)
DROP POLICY IF EXISTS "Tenant Access Outlets" ON public.outlets;
CREATE POLICY "Tenant Access Outlets" ON public.outlets
    FOR ALL 
    TO authenticated
    USING (company_id = auth.uid())
    WITH CHECK (company_id = auth.uid());

DROP POLICY IF EXISTS "Tenant Access Outlet GST" ON public.outlet_gst;
CREATE POLICY "Tenant Access Outlet GST" ON public.outlet_gst
    FOR ALL 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.outlets 
            WHERE outlets.id = outlet_gst.outlet_id 
            AND outlets.company_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.outlets 
            WHERE outlets.id = outlet_gst.outlet_id 
            AND outlets.company_id = auth.uid()
        )
    );

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (3, 'outlet_compliance_v1_fixed')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
