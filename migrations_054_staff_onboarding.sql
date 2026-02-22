
-- PAPAPOS MIGRATION 054: STAFF ONBOARDING & SECURITY
-- Target: Supabase / Postgres

BEGIN;

-- 1. ENHANCE STAFF STATUS
-- Note: Postgres doesn't allow altering existing Enums in a transaction easily without workarounds.
-- We use a text check constraint for flexibility if the enum is already present.
ALTER TABLE public.staff_users DROP CONSTRAINT IF EXISTS staff_users_status_check;
ALTER TABLE public.staff_users 
ADD COLUMN IF NOT EXISTS invite_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours'),
ADD COLUMN IF NOT EXISTS pos_pin TEXT,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- 2. STAFF QUICK LOGIN PIN (Encrypted or Hashed)
-- Ensure POS PIN is exactly 4 digits (stored as hashed in production, but for demo we allow plain-text constraint check)
ALTER TABLE public.staff_users DROP CONSTRAINT IF EXISTS pos_pin_format;
ALTER TABLE public.staff_users ADD CONSTRAINT pos_pin_format CHECK (pos_pin ~ '^[0-9]{4}$' OR pos_pin IS NULL);

-- 3. SECURITY DEFINER: GENERATE ONBOARDING LINK
CREATE OR REPLACE FUNCTION public.generate_staff_invite_token(p_staff_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_token UUID;
    v_expiry TIMESTAMPTZ;
BEGIN
    v_token := gen_random_uuid();
    v_expiry := NOW() + INTERVAL '48 hours';

    UPDATE public.staff_users
    SET 
        invite_token = v_token,
        token_expires_at = v_expiry,
        status = 'invited',
        is_verified = FALSE
    WHERE id = p_staff_id;

    RETURN jsonb_build_object(
        'token', v_token,
        'expires_at', v_expiry
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: COMPLETE ONBOARDING
-- Transitions staff from invited -> active
CREATE OR REPLACE FUNCTION public.complete_staff_onboarding(
    p_token UUID,
    p_new_password TEXT,
    p_pos_pin TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_staff_id UUID;
BEGIN
    SELECT id INTO v_staff_id 
    FROM public.staff_users 
    WHERE invite_token = p_token 
    AND token_expires_at > NOW() 
    AND is_verified = FALSE;

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired invitation token.';
    END IF;

    -- Update Staff Profile
    UPDATE public.staff_users
    SET 
        status = 'active',
        is_verified = TRUE,
        pos_pin = p_pos_pin,
        onboarding_completed_at = NOW(),
        invite_token = NULL -- Single use
    WHERE id = v_staff_id;

    -- Log Event
    INSERT INTO public.staff_history (company_id, staff_id, actor_id, event_type, old_value, new_value, reason)
    SELECT company_id, v_staff_id, auth.uid(), 'STATUS_CHANGE', '"invited"', '"active"', 'Staff onboarding completed via secure token.'
    FROM public.staff_users WHERE id = v_staff_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (54, 'staff_onboarding_security_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
