
-- PAPAPOS MIGRATION 059: OUTLET GST FIX
-- Target: Supabase / Postgres

BEGIN;

-- 1. ENFORCE OUTLET GST FIELDS
ALTER TABLE public.outlets 
ADD COLUMN IF NOT EXISTS gst_registered BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS gst_number TEXT,
ADD COLUMN IF NOT EXISTS gst_state_code TEXT;

-- 2. BACKFILL DATA FROM OLD COLUMNS IF THEY EXIST
DO $$ 
BEGIN 
    -- Migrate gstin to gst_number
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='outlets' AND column_name='gstin') THEN
        UPDATE public.outlets SET gst_number = gstin WHERE gst_number IS NULL;
    END IF;

    -- Migrate stateCode to gst_state_code
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='outlets' AND column_name='stateCode') THEN
        UPDATE public.outlets SET gst_state_code = "stateCode" WHERE gst_state_code IS NULL;
    END IF;

    -- Migrate state_code to gst_state_code (if it exists)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='outlets' AND column_name='state_code') THEN
        UPDATE public.outlets SET gst_state_code = state_code WHERE gst_state_code IS NULL;
    END IF;
END $$;

-- 3. AUTO-SET gst_registered = true for existing outlets with gst_number
UPDATE public.outlets 
SET gst_registered = true 
WHERE gst_number IS NOT NULL AND gst_number != '';

-- 4. ENFORCE NOT NULL ON gst_registered
ALTER TABLE public.outlets ALTER COLUMN gst_registered SET NOT NULL;
ALTER TABLE public.outlets ALTER COLUMN gst_registered SET DEFAULT false;

-- 5. RLS HARDENING
-- Ensure authenticated users of the same company can see all outlet columns
DROP POLICY IF EXISTS "Outlet Access" ON public.outlets;
CREATE POLICY "Outlet Access" ON public.outlets 
FOR SELECT TO authenticated 
USING (company_id = public.get_my_company_id());

-- 6. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (59, 'outlet_gst_fix_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
