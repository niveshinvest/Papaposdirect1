
-- PAPAPOS MIGRATION 015: DASHBOARD ANALYTICS MODULE
-- Target: Supabase / Postgres

-- 1. DASHBOARD CACHE (Pre-aggregated views for performance)
CREATE TABLE IF NOT EXISTS public.dashboard_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT REFERENCES public.outlets(id),
    metric_type TEXT NOT NULL, -- e.g. 'SALES_SUMMARY', 'INVENTORY_HEALTH', 'CATEGORY_DISTRIBUTION'
    metric_data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    UNIQUE(company_id, outlet_id, metric_type)
);

-- 2. RLS POLICIES
ALTER TABLE public.dashboard_cache ENABLE ROW LEVEL SECURITY;

-- Shared visibility for all company staff (Owners and Managers can refresh, everyone can see)
CREATE POLICY "Dashboard cache visibility" ON public.dashboard_cache 
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Management update cache" ON public.dashboard_cache 
    FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER')));

-- 3. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_lookup ON public.dashboard_cache(company_id, outlet_id, metric_type);

-- 4. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (15, 'dashboard_analytics_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
