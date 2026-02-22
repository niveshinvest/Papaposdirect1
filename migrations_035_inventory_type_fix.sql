
-- PAPAPOS REPAIR MIGRATION 035: INVENTORY TYPE CONVERSION
-- Target: Supabase / Postgres
-- Reason: Fix inconsistency where inventory.outlet_id was created as UUID while the rest of the system uses TEXT.
-- Impact: Prevents JOIN failures and RLS comparison errors with the outlets table.

BEGIN;

-- ==========================================
-- 1. SCHEMA VERIFICATION & LOGGING
-- ==========================================
DO $$
DECLARE
    r record;
BEGIN
    RAISE NOTICE 'Initiating outlet_id type audit...';
    FOR r IN 
        SELECT table_name, data_type 
        FROM information_schema.columns 
        WHERE column_name = 'outlet_id' AND table_schema = 'public'
    LOOP
        RAISE NOTICE 'Found - Table: %, Current Type: %', r.table_name, r.data_type;
    END LOOP;
END $$;


-- ==========================================
-- 2. CONDITIONAL CONVERSION (INVENTORY TABLE)
-- ==========================================
DO $$
BEGIN
    -- Only proceed if the column is currently UUID
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'inventory' 
        AND column_name = 'outlet_id' 
        AND data_type = 'uuid'
        AND table_schema = 'public'
    ) THEN
        RAISE NOTICE 'Type mismatch detected in inventory.outlet_id. Commencing surgery...';

        -- Drop constraint first to allow type change
        ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_outlet_id_fkey;

        -- Alter type from UUID to TEXT with explicit cast
        ALTER TABLE public.inventory ALTER COLUMN outlet_id TYPE TEXT USING outlet_id::text;
        
        -- Restore Foreign Key Constraint linking to outlets(id) which is TEXT
        ALTER TABLE public.inventory ADD CONSTRAINT inventory_outlet_id_fkey 
            FOREIGN KEY (outlet_id) REFERENCES public.outlets(id);
        
        RAISE NOTICE 'inventory.outlet_id successfully converted from UUID to TEXT.';
    ELSE
        RAISE NOTICE 'Verification Complete: inventory.outlet_id is already TEXT or correctly aligned.';
    END IF;
END $$;


-- ==========================================
-- 3. RLS ALIGNMENT & HARDENING
-- ==========================================
-- Ensure the comparison logic (TEXT = UUID) which caused errors is now (TEXT = TEXT).
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Re-apply strict isolation policy
DROP POLICY IF EXISTS "Strict Tenant Isolation" ON public.inventory;
CREATE POLICY "Strict Tenant Isolation"
ON public.inventory
FOR ALL
TO authenticated
USING (company_id = public.get_my_company_id())
WITH CHECK (company_id = public.get_my_company_id());


-- ==========================================
-- 4. VERSION RECORDING
-- ==========================================
INSERT INTO public.schema_migrations (version, name) 
VALUES (35, 'inventory_outlet_id_type_fix_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
