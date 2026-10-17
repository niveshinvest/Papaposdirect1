-- PAPAPOS MIGRATION 088: PROFILE-AUTH CLEANUP
-- Canonical auth model:
-- owners.profile_id
-- company_users.profile_id
-- outlet_users.profile_id
-- role_permissions via roles/permissions

-- 1. Staff history moves to profile_id
ALTER TABLE public.staff_history
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES auth.users(id);

ALTER TABLE public.staff_history
ALTER COLUMN staff_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_users'
      AND column_name = 'profile_id'
  ) THEN
    UPDATE public.staff_history sh
    SET profile_id = su.profile_id
    FROM public.staff_users su
    WHERE sh.staff_id = su.id
      AND sh.profile_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_history_profile_id
ON public.staff_history(profile_id, timestamp DESC);

-- 2. Devices should point to auth/profile identity directly
ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES auth.users(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_users'
      AND column_name = 'profile_id'
  ) THEN
    UPDATE public.devices d
    SET profile_id = su.profile_id
    FROM public.staff_users su
    WHERE d.staff_id = su.id
      AND d.profile_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_devices_profile_id
ON public.devices(profile_id);

-- 3. New invite table for future profile-based onboarding
CREATE TABLE IF NOT EXISTS public.profile_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN_STAFF', 'ADMIN', 'INVESTOR')),
  outlet_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
  invite_token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  accepted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, email),
  UNIQUE(invite_token)
);

ALTER TABLE public.profile_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profile invites visibility" ON public.profile_invites;
CREATE POLICY "Profile invites visibility" ON public.profile_invites
  FOR SELECT USING (
    company_id IN (
      SELECT company_id
      FROM public.company_users
      WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners manage profile invites" ON public.profile_invites;
CREATE POLICY "Owners manage profile invites" ON public.profile_invites
  FOR ALL USING (
    company_id IN (
      SELECT company_id
      FROM public.owners
      WHERE profile_id = auth.uid()
    )
  );

INSERT INTO public.schema_migrations (version, name)
VALUES (88, 'profile_auth_cleanup_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
