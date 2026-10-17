
-- PAPAPOS REPAIR MIGRATION 081: FIX STAFF HISTORY ACTOR CONSTRAINT
-- Target: Supabase / Postgres
-- Reason: Fix ERROR: null value in column "actor_id" of relation "staff_history" violates not-null constraint.
-- This occurs during onboarding when auth.uid() is null.

-- 1. RELAX CONSTRAINT ON STAFF_HISTORY
-- Allow actor_id to be NULL for system-triggered or onboarding events.
ALTER TABLE public.staff_history ALTER COLUMN actor_id DROP NOT NULL;

-- 2. REFRESH ONBOARDING RPC
-- Ensure it handles null auth.uid() gracefully (which it will now that the column is nullable).
CREATE OR REPLACE FUNCTION public.complete_staff_onboarding(
    p_token UUID,
    p_new_password TEXT,
    p_pos_pin TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_staff_id UUID;
    v_company_id UUID;
BEGIN
    -- 1. Validate Token
    SELECT id, company_id INTO v_staff_id, v_company_id
    FROM public.staff_users 
    WHERE invite_token = p_token 
    AND (token_expires_at > NOW() OR token_expires_at IS NULL)
    AND is_verified = FALSE;

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired invitation token.';
    END IF;

    -- 2. Update Staff Profile
    UPDATE public.staff_users
    SET 
        status = 'active',
        is_verified = TRUE,
        pos_pin = p_pos_pin,
        onboarding_completed_at = NOW(),
        invite_token = NULL -- Single use
    WHERE id = v_staff_id;

    -- 3. Log Event (actor_id will be NULL if not authenticated, which is expected during onboarding)
    INSERT INTO public.staff_history (company_id, staff_id, actor_id, event_type, old_value, new_value, reason)
    VALUES (
        v_company_id, 
        v_staff_id, 
        auth.uid(), 
        'STATUS_CHANGE', 
        '"invited"', 
        '"active"', 
        'Staff onboarding completed via secure token.'
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (81, 'fix_staff_history_actor_constraint_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
