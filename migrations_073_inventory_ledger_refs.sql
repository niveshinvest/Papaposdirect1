
-- PAPAPOS MIGRATION 073: INVENTORY LEDGER ENHANCEMENT
-- Target: Supabase / Postgres
-- Description: Adds reference tracking to the inventory ledger for better auditability.

-- 1. ADD REFERENCE COLUMNS
ALTER TABLE public.inventory_ledger 
ADD COLUMN IF NOT EXISTS reference_type TEXT,
ADD COLUMN IF NOT EXISTS reference_id TEXT;

-- 2. UPDATE TRANSACTION TYPE CONSTRAINT (IF NEEDED)
-- The existing constraint is: CHECK (transaction_type IN ('STOCK_IN', 'STOCK_OUT', 'WASTAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'SALE'))
-- We'll keep it as is since it covers the required types.

-- 3. INDEXING FOR AUDIT LOOKUPS
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON public.inventory_ledger(reference_type, reference_id);

-- 4. VERSION RECORDING
INSERT INTO public.schema_migrations (version, name) 
VALUES (73, 'inventory_ledger_refs_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
