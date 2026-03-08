
-- PAPAPOS MIGRATION 048: AI AUTO-RECOMMENDATIONS
-- Target: Supabase / Postgres

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE recommendation_type AS ENUM ('PRICING', 'MENU', 'STAFFING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE recommendation_status AS ENUM ('PENDING', 'APPROVED', 'DISMISSED', 'APPLIED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. AI RECOMMENDATIONS TABLE
CREATE TABLE IF NOT EXISTS public.ai_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT REFERENCES public.outlets(id),
    type recommendation_type NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    rationale TEXT NOT NULL,
    expected_impact TEXT NOT NULL,
    current_value JSONB, -- e.g., {"price": 150}
    suggested_value JSONB, -- e.g., {"price": 175}
    confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    risk_assessment TEXT,
    status recommendation_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 3. SECURITY (RLS)
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;

-- OWNER: Full Access (Approve/Dismiss)
CREATE POLICY "Owner Recommendation Control" ON public.ai_recommendations
    FOR ALL TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'OWNER')
    );

-- INVESTOR: Read-only sanitized access (No staffing details)
CREATE POLICY "Investor Recommendation View" ON public.ai_recommendations
    FOR SELECT TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'INVESTOR')
        AND type IN ('PRICING', 'MENU')
    );

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_ai_reco_status ON public.ai_recommendations(company_id, status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_ai_reco_type ON public.ai_recommendations(type);

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (48, 'ai_auto_recommendations_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
