
-- FIX: handle_new_user trigger to support staff onboarding
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_staff_record RECORD;
BEGIN
  -- 1. Check if this email exists in staff_users (invited staff)
  SELECT * INTO v_staff_record 
  FROM public.staff_users 
  WHERE email = new.email 
  LIMIT 1;

  IF v_staff_record.id IS NOT NULL THEN
    -- 2. If staff record exists, inherit role and company_id
    INSERT INTO public.profiles (id, company_id, full_name, role, is_active)
    VALUES (
      new.id, 
      v_staff_record.company_id, 
      COALESCE(new.raw_user_meta_data->>'full_name', v_staff_record.full_name), 
      v_staff_record.role, 
      TRUE
    );
    
    -- 3. Update staff_users to link the auth ID (optional but good for tracking)
    -- Note: We don't have a column for auth_user_id in staff_users yet, but we can add it or just rely on email.
  ELSE
    -- 4. Default behavior for new Owners
    INSERT INTO public.profiles (id, full_name, role, is_active)
    VALUES (
      new.id, 
      new.raw_user_meta_data->>'full_name', 
      'OWNER', 
      TRUE
    );
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record migration
INSERT INTO public.schema_migrations (version, name) 
VALUES (85, 'fix_auth_trigger_onboarding')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
