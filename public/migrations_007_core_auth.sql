
-- PAPAPOS MIGRATION 007: CORE AUTH & MULTI-TENANCY
-- Target: Supabase / Postgres

-- 1. COMPANIES (The Tenant)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    subscription_plan TEXT DEFAULT 'BASIC' CHECK (subscription_plan IN ('BASIC', 'PRO', 'ENTERPRISE')),
    owner_id UUID NOT NULL, -- references auth.users
    created_at TIMESTAMPTZ DEFAULT NOW(),
    logo_url TEXT
);

-- 2. PROFILES (RBAC & User Metadata)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    full_name TEXT,
    role TEXT DEFAULT 'CASHIER' CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN_STAFF')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. OUTLET ACCESS (Permission Mapping)
CREATE TABLE IF NOT EXISTS public.user_outlets (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL, -- references outlets table id
    PRIMARY KEY (user_id, outlet_id)
);

-- 4. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- e.g., 'LOGIN', 'PERMISSION_CHANGE', 'BILL_VOID'
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RLS POLICIES

-- Companies: Only members can see their company info
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own company" ON public.companies
    FOR SELECT USING (id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Profiles: Users can see profiles in their company
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company wide profile visibility" ON public.profiles
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Audit Logs: Only Owners/Managers can see audit logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Management audit visibility" ON public.audit_logs
    FOR SELECT USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
    );

-- 6. FUNCTIONS & TRIGGERS

-- Automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'OWNER');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (7, 'core_auth_multi_tenant_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
