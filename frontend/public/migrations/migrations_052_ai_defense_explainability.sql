
-- PAPAPOS MIGRATION 052: AI LEGAL DEFENSE & EXPLAINABILITY
-- Target: Supabase / Postgres

-- 1. EXTEND INSIGHTS
ALTER TABLE public.ai_insights 
ADD COLUMN IF NOT EXISTS explanation_object JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS data_lineage JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS compute_metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS legal_disclaimer TEXT DEFAULT 'This insight is advisory in nature and does not constitute legal, tax, or accounting advice.';

-- 2. EXTEND RECOMMENDATIONS
ALTER TABLE public.ai_recommendations 
ADD COLUMN IF NOT EXISTS explanation_object JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS data_lineage JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS compute_metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS legal_disclaimer TEXT DEFAULT 'This insight is advisory in nature and does not constitute legal, tax, or accounting advice.';

-- 3. EXTEND FORECASTS
ALTER TABLE public.ai_forecasts 
ADD COLUMN IF NOT EXISTS explanation_object JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS data_lineage JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS compute_metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS legal_disclaimer TEXT DEFAULT 'This insight is advisory in nature and does not constitute legal, tax, or accounting advice.';

-- 4. COST CONTROL TRIGGER REGISTRY
-- Track last execution time per company/type to enforce cost discipline
CREATE TABLE IF NOT EXISTS public.ai_execution_registry (
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    execution_type TEXT NOT NULL, -- INSIGHT, RECOMMENDATION, FORECAST
    last_executed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (company_id, execution_type)
);

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (52, 'ai_defense_explainability_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
