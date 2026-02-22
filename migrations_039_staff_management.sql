
-- PAPAPOS MIGRATION 039: ENTERPRISE STAFF & AUDIT
-- Target: Supabase / Postgres

BEGIN;

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE staff_status AS ENUM ('invited', 'active', 'disabled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE staff_role AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN_STAFF');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. STAFF USERS TABLE
CREATE TABLE IF NOT EXISTS public.staff_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role staff_role NOT NULL DEFAULT 'CASHIER',
    outlet_ids TEXT[] NOT NULL DEFAULT '{}',
    status staff_status NOT NULL DEFAULT 'invited',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, email)
);

-- 3. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_user_id UUID,
    action TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SECURITY (RLS)
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Staff Users RLS
CREATE POLICY "Staff Visibility" ON public.staff_users
    FOR SELECT TO authenticated
    USING (company_id = public.get_my_company_id());

CREATE POLICY "Management Staff Control" ON public.staff_users
    FOR ALL TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN')
        )
    );

-- Audit Logs RLS (Read Only for Management)
CREATE POLICY "Audit View" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN')
        )
    );

CREATE POLICY "Audit Append" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (company_id = public.get_my_company_id());

-- 5. RPC: ADMIN INVITE HELPER
-- Note: This requires service role permissions in Supabase. We simulate the wrapper here.
CREATE OR REPLACE FUNCTION public.admin_invite_user(
  p_email TEXT,
  p_company_id UUID,
  p_role TEXT,
  p_outlet_ids TEXT[]
)
RETURNS VOID AS $$
BEGIN
  -- Verification logic would go here if using custom edge functions
  -- For now, we assume the backend handles the actual Auth service call
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. HARDENED OUTLET ISOLATION TRIGGER
-- This ensures that staff can only see data for outlets they are assigned to.
CREATE OR REPLACE FUNCTION public.check_staff_outlet_access(p_outlet_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_role TEXT;
    v_outlets TEXT[];
BEGIN
    SELECT role, outlet_ids INTO v_role, v_outlets 
    FROM public.staff_users 
    WHERE id = auth.uid() AND status = 'active';

    IF v_role IN ('OWNER', 'ADMIN') THEN
        RETURN TRUE;
    END IF;

    RETURN p_outlet_id = ANY(v_outlets);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 7. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (39, 'staff_rbac_lifecycle_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
