
-- PAPAPOS MIGRATION 055: REAL-TIME REPORTING & WHATSAPP CONFIG
-- Target: Supabase / Postgres

BEGIN;

-- 1. WHATSAPP CONFIGURATION ON COMPANIES
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS whatsapp_config JSONB DEFAULT '{
    "is_connected": false,
    "phone_number": null,
    "waba_id": null,
    "webhook_verified": false,
    "last_message_at": null
}'::jsonb;

-- 2. OPTIMIZED INDEXES FOR LIVE ANALYTICS
CREATE INDEX IF NOT EXISTS idx_invoices_dashboard_lookup 
ON public.invoices (company_id, outlet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_items_perf 
ON public.invoice_items (invoice_id);

-- 3. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (55, 'live_reporting_foundations_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
