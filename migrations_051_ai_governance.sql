
-- PAPAPOS MIGRATION 051: AI GOVERNANCE & KILL-SWITCH
-- Target: Supabase / Postgres

BEGIN;

-- 1. KILL-SWITCH STATE ON COMPANIES
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS ai_kill_switch BOOLEAN DEFAULT FALSE;

-- 2. AI GOVERNANCE AUDIT LOG (IMMUTABLE)
CREATE TABLE IF NOT EXISTS public.ai_governance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ai_mode TEXT NOT NULL CHECK (ai_mode IN ('NORMAL', 'REGULATORY_SAFE', 'KILL_SWITCH_ACTIVE')),
    role_visibility TEXT NOT NULL CHECK (role_visibility IN ('OWNER', 'INVESTOR')),
    data_sources TEXT[] NOT NULL,
    confidence_score NUMERIC(3,2),
    approval_required BOOLEAN DEFAULT TRUE,
    payload_type TEXT NOT NULL, -- INSIGHT, RECOMMENDATION, FORECAST
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 3. IMMUTABILITY ENFORCEMENT
CREATE OR REPLACE FUNCTION public.block_governance_tamper()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Governance Violation: AI audit records are legally protected and immutable.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_lock_ai_governance
    BEFORE UPDATE OR DELETE ON public.ai_governance_logs
    FOR EACH ROW EXECUTE FUNCTION public.block_governance_tamper();

-- 4. SECURITY (RLS)
ALTER TABLE public.ai_governance_logs ENABLE ROW LEVEL SECURITY;

-- Visibility: Owners only. Investors do not see the internal governance logs.
CREATE POLICY "Owner Governance View" ON public.ai_governance_logs
    FOR SELECT TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'OWNER')
    );

-- System Write: Allowed for authenticated users within their company context
CREATE POLICY "System Governance Write" ON public.ai_governance_logs
    FOR INSERT TO authenticated
    WITH CHECK (company_id = public.get_my_company_id());

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (51, 'ai_governance_failsafe_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
