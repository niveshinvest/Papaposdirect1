
-- PAPAPOS MIGRATION 063: INVOICE SCHEMA ALIGNMENT
-- Target: Supabase / Postgres
-- Description: Adds missing finalized_by_user_id column to invoices table for audit tracking.

-- 1. ADD COLUMN
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS finalized_by_user_id UUID REFERENCES public.profiles(id);

-- 2. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (63, 'invoice_audit_columns_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
