
-- PAPAPOS MIGRATION 044: AUTO-APPROVE FIRST OWNER TERMINAL
-- Target: Supabase / Postgres
-- Rule: First terminal for a new company is auto-approved ONLY if the user is the OWNER.

-- Update the handshake function to implement one-time auto-approval logic
CREATE OR REPLACE FUNCTION public.pos_terminal_handshake(
    p_terminal_id TEXT,
    p_user_id UUID,
    p_company_id UUID,
    p_outlet_id TEXT,
    p_device_info JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_user_role TEXT;
    v_approved_count INTEGER;
    v_terminal_status terminal_status;
    v_terminal_name TEXT;
    v_session_id UUID;
    v_approval_mode TEXT := 'manual';
    v_result JSONB;
BEGIN
    -- 1. Identity & Permissions Verification
    SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id AND company_id = p_company_id AND is_active = TRUE;
    
    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'Identity mismatch or inactive account.';
    END IF;

    -- 2. Check for existing terminal status
    SELECT status, name INTO v_terminal_status, v_terminal_name FROM public.terminals WHERE id = p_terminal_id;

    -- 3. Hard Reject if Revoked
    IF v_terminal_status = 'REVOKED' THEN
        RAISE EXCEPTION 'Access revoked for this terminal.';
    END IF;

    -- 4. AUTO-APPROVAL LOGIC (OWNER ONLY, ONCE PER COMPANY)
    IF v_user_role = 'OWNER' AND (v_terminal_status IS NULL OR v_terminal_status = 'PENDING_APPROVAL') THEN
        SELECT COUNT(*) INTO v_approved_count FROM public.terminals WHERE company_id = p_company_id AND status = 'APPROVED';
        
        IF v_approved_count = 0 THEN
            v_terminal_status := 'APPROVED';
            v_approval_mode := 'auto';
            
            -- Insert or Update Terminal with system approval metadata
            INSERT INTO public.terminals (id, company_id, outlet_id, status, name, device_info, last_seen_at)
            VALUES (p_terminal_id, p_company_id, p_outlet_id, 'APPROVED', 'Primary POS', p_device_info, NOW())
            ON CONFLICT (id) DO UPDATE SET 
                status = 'APPROVED',
                name = COALESCE(terminals.name, 'Primary POS'),
                last_seen_at = NOW(),
                device_info = p_device_info;

            -- IMMUTABLE AUDIT LOG
            INSERT INTO public.audit_logs (company_id, actor_user_id, action, metadata)
            VALUES (
                p_company_id, 
                p_user_id, 
                'TERMINAL_AUTO_APPROVED', 
                jsonb_build_object(
                    'terminal_id', p_terminal_id,
                    'reason', 'first_owner_terminal',
                    'severity', 'high'
                )
            );
        END IF;
    END IF;

    -- 5. Standard Terminal Entry (if not handled by auto-approval)
    IF v_approval_mode = 'manual' THEN
        INSERT INTO public.terminals (id, company_id, outlet_id, device_info, last_seen_at)
        VALUES (p_terminal_id, p_company_id, p_outlet_id, p_device_info, NOW())
        ON CONFLICT (id) DO UPDATE SET 
            last_seen_at = NOW(),
            device_info = p_device_info;
            
        SELECT status, name INTO v_terminal_status, v_terminal_name FROM public.terminals WHERE id = p_terminal_id;
    END IF;

    -- 6. Create/Refurbish Session
    INSERT INTO public.staff_sessions (user_id, company_id, outlet_id, device_id, device_name, terminal_id, last_active_at)
    VALUES (p_user_id, p_company_id, p_outlet_id, p_terminal_id, (p_device_info->>'ua'), p_terminal_id, NOW())
    ON CONFLICT (user_id, terminal_id) WHERE status = 'active'
    DO UPDATE SET 
        last_active_at = NOW(),
        outlet_id = p_outlet_id
    RETURNING id INTO v_session_id;

    -- 7. Construct Result Packet
    v_result := jsonb_build_object(
        'session_id', v_session_id,
        'approval_mode', v_approval_mode,
        'terminal', jsonb_build_object(
            'id', p_terminal_id,
            'status', v_terminal_status,
            'name', COALESCE(v_terminal_name, 'Terminal')
        )
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (44, 'auto_approve_first_owner_terminal_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
