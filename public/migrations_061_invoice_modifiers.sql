-- Migration: Add modifiers to invoice items
-- Description: Stores selected modifiers for each item in an invoice for audit compliance.

ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS selected_modifiers JSONB;

-- Record migration
INSERT INTO public.schema_migrations (version, name)
VALUES (61, 'invoice_items_modifiers');
