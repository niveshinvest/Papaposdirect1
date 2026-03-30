-- PAPAPOS MIGRATION 083: FIX INVENTORY RELATIONSHIPS
-- Target: Supabase / Postgres
-- Description: Adds foreign key constraints to inventory-related tables to enable PostgREST joins.

-- 1. inventory_ledger -> inventory
-- We use item_id as the foreign key to inventory.id
ALTER TABLE public.inventory_ledger 
ADD CONSTRAINT inventory_ledger_item_id_fkey 
FOREIGN KEY (item_id) REFERENCES public.inventory(id) 
ON DELETE CASCADE;

-- 2. inventory_batches -> inventory
ALTER TABLE public.inventory_batches 
ADD CONSTRAINT inventory_batches_item_id_fkey 
FOREIGN KEY (item_id) REFERENCES public.inventory(id) 
ON DELETE CASCADE;

-- 3. inventory_wastage -> inventory
ALTER TABLE public.inventory_wastage 
ADD CONSTRAINT inventory_wastage_item_id_fkey 
FOREIGN KEY (item_id) REFERENCES public.inventory(id) 
ON DELETE CASCADE;

-- Record migration
INSERT INTO public.schema_migrations (version, name) 
VALUES (83, 'fix_inventory_relationships')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
