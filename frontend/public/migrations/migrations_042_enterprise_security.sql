
-- PAPAPOS MIGRATION 042: ENTERPRISE TERMINAL & SESSION GOVERNANCE
-- Target: Supabase / Postgres

-- 1. TERMINAL REGISTRY
CREATE TYPE terminal_status AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'SUSPENDED', 'REVOKED');

CREATE TABLE IF NOT EXISTS public.terminals (
    id TEXT PRIMARY KEY, -- TRM-... persistent ID
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT REFERENCES public.outlets(id),
    name TEXT, -- Friendly name (e.g. "Front Counter Tablet")
    status terminal_status NOT NULL DEFAULT 'PENDING_APPROVAL',
    device_info JSONB DEFAULT '{}'::jsonb, -- ua, resolution, pwa mode
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ENHANCE STAFF SESSIONS
ALTER TABLE public.staff_sessions ADD COLUMN IF NOT EXISTS terminal_id TEXT REFERENCES public.terminals(id);
ALTER TABLE public.staff_sessions ALTER COLUMN outlet_id DROP NOT NULL; -- Allow login before outlet selection

-- 3. SECURITY DEFINER: POS HANDSHAKE
-- This is the single entrance point for POS terminals to announce themselves
CREATE OR REPLACE FUNCTION public.pos_terminal_handshake(
    p_terminal_id TEXT,
    p_user_id UUID,
    p_company_id UUID,
    p_outlet_id TEXT,
    p_device_info JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_terminal_status terminal_status;
    v_terminal_name TEXT;
    v_session_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Ensure terminal exists
    INSERT INTO public.terminals (id, company_id, outlet_id, device_info, last_seen_at)
    VALUES (p_terminal_id, p_company_id, p_outlet_id, p_device_info, NOW())
    ON CONFLICT (id) DO UPDATE SET 
        last_seen_at = NOW(),
        device_info = p_device_info;

    -- 2. Fetch Terminal Status
    SELECT status, name INTO v_terminal_status, v_terminal_name 
    FROM public.terminals WHERE id = p_terminal_id;

    -- 3. Hard Reject if Revoked
    IF v_terminal_status = 'REVOKED' THEN
        RAISE EXCEPTION 'Access revoked for this terminal.';
    END IF;

    -- 4. Create/Refurbish Session
    -- Multi-device policy: New session on new terminal, refresh session on same terminal
    INSERT INTO public.staff_sessions (user_id, company_id, outlet_id, device_id, device_name, terminal_id, last_active_at)
    VALUES (p_user_id, p_company_id, p_outlet_id, p_terminal_id, (p_device_info->>'ua'), p_terminal_id, NOW())
    ON CONFLICT (user_id, terminal_id) WHERE status = 'active'
    DO UPDATE SET 
        last_active_at = NOW(),
        outlet_id = p_outlet_id
    RETURNING id INTO v_session_id;

    -- 5. Construct Identity Packet
    v_result := jsonb_build_object(
        'session_id', v_session_id,
        'terminal', jsonb_build_object(
            'id', p_terminal_id,
            'status', v_terminal_status,
            'name', v_terminal_name
        )
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RLS HARDENING
ALTER TABLE public.terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management Fleet Visibility" ON public.terminals
    FOR SELECT TO authenticated
    USING (company_id = public.get_my_company_id());

CREATE POLICY "Management Fleet Control" ON public.terminals
    FOR ALL TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN'))
    );

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (42, 'enterprise_pos_fleet_governance_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
