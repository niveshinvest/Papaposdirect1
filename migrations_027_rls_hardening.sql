
-- PAPAPOS MIGRATION 027: HARDENED RLS RECOVERY
-- Target: Supabase / Postgres
-- Description: Re-applies hardened policies now that columns physically exist.

BEGIN;

-- Using security helper public.get_my_company_id() to break recursion
DO $$ 
DECLARE 
    t text;
    ops_tables text[] := ARRAY[
        'order_items', 
        'purchase_items', 
        'delivery_order_items', 
        'kitchen_status_logs',
        'bill_taxes',
        'payments'
    ];
BEGIN
    FOREACH t IN ARRAY ops_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Operational Isolation" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Operational Isolation" ON public.%I FOR ALL TO authenticated USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id())', t);
    END LOOP;
END $$;

-- 2. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (27, 'hardened_rls_recovery')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
