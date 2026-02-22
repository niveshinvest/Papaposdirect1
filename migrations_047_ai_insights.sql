
-- PAPAPOS MIGRATION 047: AI BUSINESS INTELLIGENCE
-- Target: Supabase / Postgres

BEGIN;

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE insight_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE insight_category AS ENUM ('SALES', 'PAYMENTS', 'STAFF', 'FLEET', 'COMPLIANCE', 'MARGIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. AI INSIGHTS TABLE
CREATE TABLE IF NOT EXISTS public.ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT REFERENCES public.outlets(id),
    severity insight_severity NOT NULL DEFAULT 'LOW',
    category insight_category NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    explanation TEXT,
    recommended_action TEXT,
    data_points JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_tables TEXT[] NOT NULL,
    confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SECURITY (RLS)
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

-- OWNER: Full Visibility
CREATE POLICY "Owner Full Insight Access" ON public.ai_insights
    FOR ALL TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'OWNER')
    );

-- INVESTOR: Financial-Only Visibility (No Staff/Fleet Alerts)
CREATE POLICY "Investor Financial Insight Access" ON public.ai_insights
    FOR SELECT TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'INVESTOR')
        AND category IN ('SALES', 'PAYMENTS', 'MARGIN', 'COMPLIANCE')
    );

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_ai_insights_unresolved ON public.ai_insights(company_id, is_dismissed) WHERE is_dismissed = FALSE;
CREATE INDEX IF NOT EXISTS idx_ai_insights_outlet ON public.ai_insights(outlet_id);

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (47, 'ai_business_intelligence_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
