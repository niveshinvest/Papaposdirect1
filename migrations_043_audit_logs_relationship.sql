
-- SECTION 1: Fix column name mismatch and verify types
DO $$ 
BEGIN
    -- Rename user_id to actor_user_id if legacy column exists from Migration 007
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'user_id' AND table_schema = 'public'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'actor_user_id' AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.audit_logs RENAME COLUMN user_id TO actor_user_id;
    END IF;

    -- Ensure actor_user_id exists if neither column was present
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'actor_user_id' AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.audit_logs ADD COLUMN actor_user_id UUID;
    END IF;
END $$;

-- Verify final state for PostgREST cache
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('audit_logs', 'profiles') 
AND column_name IN ('actor_user_id', 'id') 
AND table_schema = 'public';

-- SECTION 2: SQL to add foreign key constraint
BEGIN;
  -- Clean up any legacy keys
  ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
  ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_user_id_fkey;
  
  -- Establish explicit link to public.profiles table
  ALTER TABLE public.audit_logs 
  ADD CONSTRAINT audit_logs_actor_user_id_fkey 
  FOREIGN KEY (actor_user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE SET NULL;
COMMIT;

-- SECTION 3: SQL to reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- SECTION 4: One-line confirmation
-- The query select=*,profiles(*) will now resolve via the audit_logs_actor_user_id_fkey relationship.
