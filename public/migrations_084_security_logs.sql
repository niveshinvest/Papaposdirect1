
-- PAPAPOS MIGRATION 084: SECURITY AUDIT LOGS
-- Target: Supabase / Postgres

CREATE TABLE IF NOT EXISTS public.security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view security logs" ON public.security_logs
    FOR SELECT TO authenticated
    USING (
        company_id = public.get_my_company_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN')
        )
    );

CREATE POLICY "System can insert security logs" ON public.security_logs
    FOR INSERT TO authenticated
    WITH CHECK (company_id = public.get_my_company_id());

-- Record migration
INSERT INTO public.schema_migrations (version, name) 
VALUES (84, 'security_audit_logs')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
