
-- PAPAPOS MIGRATION 041: HR COMPLIANCE STAFF LIFECYCLE JOURNAL
-- Target: Supabase / Postgres

BEGIN;

-- 1. COMPLIANCE HISTORY TABLE (APPEND-ONLY)
CREATE TABLE IF NOT EXISTS public.staff_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES auth.users(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('ROLE_CHANGE', 'OUTLET_CHANGE', 'STATUS_CHANGE', 'AUTH_EVENT')),
    old_value JSONB,
    new_value JSONB,
    reason TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2. IMMUTABILITY ENFORCEMENT
-- Records in this table can never be updated or deleted.
CREATE OR REPLACE FUNCTION public.block_immutable_audit()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Compliance Violation: Staff lifecycle records are immutable and legally protected.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_lock_staff_history
    BEFORE UPDATE OR DELETE ON public.staff_history
    FOR EACH ROW EXECUTE FUNCTION public.block_immutable_audit();

-- 3. SECURITY (RLS)
ALTER TABLE public.staff_history ENABLE ROW LEVEL SECURITY;

-- Visibility Policy: Only Management (OWNER/ADMIN) can see lifecycle history.
-- Staff members are prohibited from seeing their own disciplinary or status logs to maintain HR confidentiality.
CREATE POLICY "Management Compliance Visibility" ON public.staff_history
    FOR SELECT TO authenticated
    USING (
        company_id = public.get_my_company_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN')
        )
    );

-- Writing Policy: Anyone authenticated can insert if they are part of the company.
-- (Actual logic is gated at the service level to ensure reasons are provided).
CREATE POLICY "Authorized Compliance Append" ON public.staff_history
    FOR INSERT TO authenticated
    WITH CHECK (company_id = public.get_my_company_id());

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_staff_history_lookup ON public.staff_history(staff_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_staff_history_company ON public.staff_history(company_id);

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (41, 'staff_hr_compliance_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
