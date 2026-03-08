
-- PAPAPOS MIGRATION 050: AI SALES FORECASTING
-- Target: Supabase / Postgres

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE forecast_horizon AS ENUM ('7_DAYS', '30_DAYS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. AI FORECASTS TABLE
CREATE TABLE IF NOT EXISTS public.ai_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT REFERENCES public.outlets(id), -- NULL means company aggregate
    horizon forecast_horizon NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Predictions
    predicted_revenue_min NUMERIC(15,2) NOT NULL,
    predicted_revenue_max NUMERIC(15,2) NOT NULL,
    predicted_orders INTEGER NOT NULL,
    
    -- Pattern Insights
    peak_days TEXT[] DEFAULT '{}',
    slow_days TEXT[] DEFAULT '{}',
    
    -- Metadata & Accuracy
    confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    assumptions TEXT,
    historical_baseline_revenue NUMERIC(15,2), -- Average revenue of previous same-length period
    error_margin_percent NUMERIC(5,2),
    
    UNIQUE(company_id, outlet_id, horizon)
);

-- 3. SECURITY (RLS)
ALTER TABLE public.ai_forecasts ENABLE ROW LEVEL SECURITY;

-- OWNER: Full Access
CREATE POLICY "Owner Forecast Access" ON public.ai_forecasts
    FOR ALL TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'OWNER')
    );

-- INVESTOR: Aggregated View Only (No specific outlet forecasts if they exist)
CREATE POLICY "Investor Aggregate Forecast Access" ON public.ai_forecasts
    FOR SELECT TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'INVESTOR')
        AND outlet_id IS NULL -- Only see company-level projections
    );

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_lookup ON public.ai_forecasts(company_id, outlet_id, horizon);

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (50, 'ai_sales_forecasting_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
