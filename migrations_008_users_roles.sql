
-- PAPAPOS MIGRATION 008: USERS & ROLES (RBAC)
-- Target: Supabase / Postgres

-- 1. ROLE PERMISSIONS (Granular functional keys)
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN_STAFF')),
    permission TEXT NOT NULL, -- e.g., 'billing:void', 'inventory:edit', 'reports:view'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, role, permission)
);

-- 2. USER ROLES (Assignments)
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN_STAFF')),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, role)
);

-- 3. USER OUTLET ACCESS (Granular Site Mapping)
-- Replacing/Migrating from user_outlets in v7
CREATE TABLE IF NOT EXISTS public.user_outlet_access (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL, -- Matches outlets.id (text based)
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    access_level TEXT DEFAULT 'VIEW' CHECK (access_level IN ('VIEW', 'FULL')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, outlet_id)
);

-- 4. RLS POLICIES

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_outlet_access ENABLE ROW LEVEL SECURITY;

-- Role Permissions: Visible to everyone in the company for UI gating, editable by Owners
CREATE POLICY "Company permissions visibility" ON public.role_permissions
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Owners manage permissions" ON public.role_permissions
    FOR ALL USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'OWNER')
    );

-- User Roles: Visible to company members, managed by Owners/Managers
CREATE POLICY "Company roles visibility" ON public.user_roles
    FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Management manages roles" ON public.user_roles
    FOR ALL USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
    );

-- Outlet Access: Visible to user (self) and managers
CREATE POLICY "Outlet access visibility" ON public.user_outlet_access
    FOR SELECT USING (
        user_id = auth.uid() OR 
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
    );

CREATE POLICY "Management manages outlet access" ON public.user_outlet_access
    FOR ALL USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
    );

-- 5. INITIAL SEED: Standard Permissions
-- Note: In a real app, this would be a function called upon Company Creation.
-- We'll add a trigger to seed standard permissions when a new company is added.

CREATE OR REPLACE FUNCTION public.seed_company_permissions()
RETURNS trigger AS $$
BEGIN
    -- OWNER PERMISSIONS
    INSERT INTO public.role_permissions (company_id, role, permission) VALUES
    (new.id, 'OWNER', 'all'),
    -- MANAGER PERMISSIONS
    (new.id, 'MANAGER', 'billing:view'),
    (new.id, 'MANAGER', 'billing:create'),
    (new.id, 'MANAGER', 'inventory:view'),
    (new.id, 'MANAGER', 'inventory:edit'),
    (new.id, 'MANAGER', 'reports:view'),
    -- CASHIER PERMISSIONS
    (new.id, 'CASHIER', 'billing:view'),
    (new.id, 'CASHIER', 'billing:create');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_company_created ON public.companies;
CREATE TRIGGER on_company_created
    AFTER INSERT ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.seed_company_permissions();

-- 6. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (8, 'rbac_users_roles_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
