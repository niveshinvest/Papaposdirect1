
-- Migration: Multi-Tenant Fix
-- Description: Adds company_users table and updates outlets for multi-tenancy

-- 1. Ensure company_users table exists
CREATE TABLE IF NOT EXISTS public.company_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN_STAFF', 'ADMIN', 'INVESTOR')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, company_id)
);

-- 1.1 Optional outlet_users table
CREATE TABLE IF NOT EXISTS public.outlet_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN_STAFF', 'ADMIN', 'INVESTOR')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, outlet_id)
);

-- 2. Update outlets table to include company_id if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='outlets' AND column_name='company_id') THEN
        ALTER TABLE public.outlets ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='outlets' AND column_name='created_at') THEN
        ALTER TABLE public.outlets ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 3. RLS for company_users
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own company memberships" ON public.company_users;
CREATE POLICY "Users can see their own company memberships" ON public.company_users
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can manage company users" ON public.company_users;
CREATE POLICY "Owners can manage company users" ON public.company_users
    FOR ALL USING (
        company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid() AND role = 'OWNER')
    );

-- 3.1 RLS for outlet_users
ALTER TABLE public.outlet_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own outlet memberships" ON public.outlet_users;
CREATE POLICY "Users can see their own outlet memberships" ON public.outlet_users
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can manage outlet users" ON public.outlet_users;
CREATE POLICY "Owners can manage outlet users" ON public.outlet_users
    FOR ALL USING (
        outlet_id IN (SELECT id FROM public.outlets WHERE company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid() AND role = 'OWNER'))
    );

-- 4. Update outlets RLS to be company-aware
DROP POLICY IF EXISTS "Public Access Outlets" ON public.outlets;
CREATE POLICY "Company members can see their outlets" ON public.outlets
    FOR SELECT USING (
        company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid())
    );

-- 5. Backfill company_users from profiles
INSERT INTO public.company_users (user_id, company_id, role)
SELECT id, company_id, role FROM public.profiles
WHERE company_id IS NOT NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

-- 5.1 Backfill outlet_users from user_outlets
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='user_outlets') THEN
        INSERT INTO public.outlet_users (user_id, outlet_id, role)
        SELECT uo.user_id, uo.outlet_id, p.role
        FROM public.user_outlets uo
        JOIN public.profiles p ON p.id = uo.user_id
        ON CONFLICT (user_id, outlet_id) DO NOTHING;
    END IF;
END $$;

-- 6. Record Migration
INSERT INTO public.schema_migrations (version, name) 
VALUES (78, 'multi_tenant_fix_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

-- 7. Ensure Permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
