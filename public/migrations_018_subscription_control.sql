
-- PAPAPOS MIGRATION 018: TRIAL & SUBSCRIPTION ENFORCEMENT
-- Target: Supabase / Postgres

-- 1. ENHANCE COMPANIES SCHEMA
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trialing' 
CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS data_retention_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '37 days'); -- 7 (trial) + 30 (retention)

-- 2. SUBSCRIPTION VALIDATION HELPER
-- This function is the single source of truth for RLS write-gates.
CREATE OR REPLACE FUNCTION public.is_subscription_valid(cid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_status TEXT;
    v_trial_end TIMESTAMPTZ;
    v_sub_end TIMESTAMPTZ;
BEGIN
    SELECT subscription_status, trial_ends_at, subscription_expires_at 
    INTO v_status, v_trial_end, v_sub_end
    FROM public.companies
    WHERE id = cid;

    -- Block if status is expired or canceled
    IF v_status IN ('expired', 'canceled') THEN
        RETURN FALSE;
    END IF;

    -- Allow if explicitly active
    IF v_status = 'active' THEN
        RETURN TRUE;
    END IF;

    -- Allow if trialing and within 7 days
    IF v_status = 'trialing' AND NOW() <= v_trial_end THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. HARDENED RLS POLICIES (Write Protection)
-- We wrap existing policies or create new ones that verify subscription validity before allowing INSERTS/UPDATES.

-- Example for Orders
DROP POLICY IF EXISTS "Sales entry" ON public.orders;
CREATE POLICY "Sales entry with subscription check" ON public.orders
    FOR INSERT 
    WITH CHECK (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND public.is_subscription_valid(company_id)
    );

-- Example for Inventory
DROP POLICY IF EXISTS "Management manage inventory" ON public.inventory_batches;
CREATE POLICY "Inventory write with subscription check" ON public.inventory_batches
    FOR ALL
    USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
        AND public.is_subscription_valid(company_id)
    );

-- 4. UPGRADE & FRESH START RPC
-- Handles the requirement 7: upgrade with choice to wipe data
CREATE OR REPLACE FUNCTION public.upgrade_company_subscription(
    target_company_id UUID,
    new_plan TEXT,
    clear_existing_data BOOLEAN
)
RETURNS VOID AS $$
BEGIN
    -- Only the company owner can trigger this
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = target_company_id AND owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- 1. Update Subscription Status
    UPDATE public.companies 
    SET 
        subscription_status = 'active',
        subscription_plan = new_plan,
        subscription_expires_at = NOW() + INTERVAL '30 days',
        trial_started_at = NULL, -- Trial ends
        data_retention_until = NOW() + INTERVAL '365 days' -- Long term retention
    WHERE id = target_company_id;

    -- 2. Optional Fresh Start Wipe (Transactional)
    IF clear_existing_data THEN
        DELETE FROM public.orders WHERE company_id = target_company_id;
        DELETE FROM public.inventory_batches WHERE company_id = target_company_id;
        DELETE FROM public.inventory_ledger WHERE company_id = target_company_id;
        DELETE FROM public.procurement_orders WHERE company_id = target_company_id;
        -- Keep Menu and Profiles as these are essential configurations
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (18, 'subscription_control_gate_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
