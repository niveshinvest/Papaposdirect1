
-- PAPAPOS MIGRATION 016: AI SERVICES MODULE
-- Target: Supabase / Postgres

-- 1. AI PREDICTIONS (Demand & Inventory Forecasting)
CREATE TABLE IF NOT EXISTS public.ai_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    prediction_type TEXT NOT NULL CHECK (prediction_type IN ('DEMAND', 'INVENTORY_RUNOUT', 'LABOR_REQUIREMENT')),
    target_date DATE NOT NULL,
    forecast_data JSONB NOT NULL, -- e.g. { "value": 45000, "unit": "INR" }
    confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    model_version TEXT DEFAULT 'gemini-3-pro',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. AI ANOMALIES (Security & Pattern Auditing)
CREATE TABLE IF NOT EXISTS public.ai_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    category TEXT NOT NULL CHECK (category IN ('BILLING', 'INVENTORY', 'STAFF_BEHAVIOR')),
    description TEXT NOT NULL,
    source_evidence JSONB, -- Contextual data snippet (e.g., the order IDs involved)
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS POLICIES
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_anomalies ENABLE ROW LEVEL SECURITY;

-- Predictions visibility: All company staff can see forecasts
CREATE POLICY "Predictions visibility" ON public.ai_predictions 
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Anomalies visibility: Only Owners and Managers can see security alerts
CREATE POLICY "Security alerts visibility" ON public.ai_anomalies 
    FOR SELECT USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
    );

-- System Write Access: For the application to record AI findings
CREATE POLICY "System write predictions" ON public.ai_predictions 
    FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "System write anomalies" ON public.ai_anomalies 
    FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_ai_predictions_outlet_date ON public.ai_predictions(outlet_id, target_date);
CREATE INDEX IF NOT EXISTS idx_ai_anomalies_unresolved ON public.ai_anomalies(company_id, is_resolved) WHERE is_resolved = FALSE;

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (16, 'ai_services_core_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
