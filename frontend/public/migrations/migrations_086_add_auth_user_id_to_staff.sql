
-- Add auth_user_id to staff_users for better linking
ALTER TABLE public.staff_users ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);

-- Update trigger to use auth_user_id if available
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
    
    -- 3. Update staff_users to link the auth ID
    UPDATE public.staff_users 
    SET auth_user_id = new.id,
        status = 'active' -- Auto-activate if they just signed up
    WHERE id = v_staff_record.id;
    
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
VALUES (86, 'add_auth_user_id_to_staff')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
