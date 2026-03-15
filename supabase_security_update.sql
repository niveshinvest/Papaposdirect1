
-- PAPAPOS SECURITY ARCHITECTURE UPDATE

-- 1. Staff Outlet Access Table
CREATE TABLE IF NOT EXISTS public.staff_outlet_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id uuid NOT NULL,
    outlet_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Devices Table
CREATE TABLE IF NOT EXISTS public.devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_fingerprint TEXT NOT NULL,
    device_name TEXT,
    staff_id uuid,
    outlet_id TEXT,
    approved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. RLS Policies for Outlets
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff outlet access" ON public.outlets;
CREATE POLICY "staff outlet access"
ON public.outlets
FOR SELECT
USING (
    id IN (
        SELECT outlet_id
        FROM public.staff_outlet_access
        WHERE staff_id = auth.uid()
    )
    OR 
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN')
    )
);

-- 4. RLS for Staff Outlet Access
ALTER TABLE public.staff_outlet_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage access" ON public.staff_outlet_access
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN')));
CREATE POLICY "Staff can view their own access" ON public.staff_outlet_access
    FOR SELECT USING (staff_id = auth.uid());

-- 5. RLS for Devices
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage devices" ON public.devices
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN')));
CREATE POLICY "Staff can view their own devices" ON public.devices
    FOR SELECT USING (staff_id = auth.uid());

-- 6. Record Migration
INSERT INTO public.schema_migrations (version, name) 
VALUES (4, 'security_architecture_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
