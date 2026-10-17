-- Migration: 203_add_invoice_item_guard.sql
-- Purpose: Prevent direct inserts/edits to invoice_items that bypass FIFO allocation.
-- Trusted services can set the session setting `papa.bypass_inventory_guard` = 'true' to bypass.

BEGIN;

-- Trigger function
CREATE OR REPLACE FUNCTION public.guard_invoice_item_insert()
RETURNS trigger AS $$
DECLARE
  bypass text;
BEGIN
  bypass := current_setting('papa.bypass_inventory_guard', true);
  IF bypass IS NOT NULL AND lower(bypass) IN ('1','true','on') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Direct writes to invoice_items are prohibited. Use the RPC create_invoice_with_inventory to ensure FIFO allocation and stock integrity.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to protect inserts and updates that modify quantity or menu_item
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoice_items') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_invoice_item_insert') THEN
      CREATE TRIGGER trg_guard_invoice_item_insert
      BEFORE INSERT OR UPDATE ON public.invoice_items
      FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_item_insert();
    END IF;
  END IF;
END$$;

-- Record migration
INSERT INTO public.schema_migrations (version, name) VALUES (203, 'add_invoice_item_guard') ON CONFLICT (version) DO NOTHING;

COMMIT;
