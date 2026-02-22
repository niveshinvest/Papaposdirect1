
-- PAPAPOS MIGRATION 040: STRICT SESSION CONTROL
-- Target: Supabase / Postgres

BEGIN;

-- 1. SESSION REGISTRY
CREATE TABLE IF NOT EXISTS public.staff_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id),
    device_id TEXT NOT NULL,
    device_name TEXT,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SESSION CONFIGURATION
CREATE TABLE IF NOT EXISTS public.session_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- OWNER, ADMIN, MANAGER, CASHIER
    max_sessions INTEGER DEFAULT 1,
    UNIQUE(company_id, role)
);

-- 3. RPC: REGISTER STAFF SESSION (WITH AUTO-ENFORCEMENT)
CREATE OR REPLACE FUNCTION public.register_staff_session(
    p_user_id UUID,
    p_company_id UUID,
    p_outlet_id TEXT,
    p_device_id TEXT,
    p_device_name TEXT
)
RETURNS UUID AS $$
DECLARE
    v_role TEXT;
    v_max INTEGER;
    v_active_count INTEGER;
    v_new_session_id UUID;
BEGIN
    -- 1. Determine role and limits
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
    
    SELECT max_sessions INTO v_max 
    FROM public.session_configs 
    WHERE company_id = p_company_id AND role = v_role;
    
    IF v_max IS NULL THEN v_max := 1; END IF; -- Default strict

    -- 2. Invalidate existing session on SAME device if exists
    UPDATE public.staff_sessions 
    SET status = 'expired' 
    WHERE user_id = p_user_id AND device_id = p_device_id AND status = 'active';

    -- 3. Check global session limit for user
    SELECT COUNT(*) INTO v_active_count 
    FROM public.staff_sessions 
    WHERE user_id = p_user_id AND status = 'active';

    -- If over limit, revoke oldest sessions
    IF v_active_count >= v_max THEN
        UPDATE public.staff_sessions
        SET status = 'revoked'
        WHERE id IN (
            SELECT id FROM public.staff_sessions
            WHERE user_id = p_user_id AND status = 'active'
            ORDER BY last_active_at ASC
            LIMIT (v_active_count - v_max + 1)
        );
    END IF;

    -- 4. Insert new session
    INSERT INTO public.staff_sessions (user_id, company_id, outlet_id, device_id, device_name)
    VALUES (p_user_id, p_company_id, p_outlet_id, p_device_id, p_device_name)
    RETURNING id INTO v_new_session_id;

    RETURN v_new_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. SECURITY (RLS)
ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session Visibility" ON public.staff_sessions 
    FOR SELECT TO authenticated 
    USING (company_id = public.get_my_company_id());

CREATE POLICY "Management Session Control" ON public.staff_sessions 
    FOR UPDATE TO authenticated 
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN'))
    );

CREATE POLICY "Config Visibility" ON public.session_configs 
    FOR SELECT TO authenticated 
    USING (company_id = public.get_my_company_id());

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (40, 'strict_session_control_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
