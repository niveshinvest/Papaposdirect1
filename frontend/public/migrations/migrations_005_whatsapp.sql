
-- PAPAPOS MIGRATION 005: WHATSAPP INTEGRATION
-- Target: Supabase / Postgres

-- 1. WHATSAPP TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
    content TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('APPROVED', 'PENDING', 'REJECTED')),
    variables JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    "syncStatus" TEXT DEFAULT 'synced'
);

-- 2. WHATSAPP LOGS TABLE
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
    id TEXT PRIMARY KEY,
    "recipientPhone" TEXT NOT NULL,
    "customerName" TEXT,
    "templateName" TEXT,
    status TEXT DEFAULT 'SENT' CHECK (status IN ('SENT', 'DELIVERED', 'READ', 'FAILED')),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    "orderId" TEXT,
    "syncStatus" TEXT DEFAULT 'synced'
);

-- 3. RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access WhatsApp Templates" ON public.whatsapp_templates;
CREATE POLICY "Public Access WhatsApp Templates" ON public.whatsapp_templates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access WhatsApp Logs" ON public.whatsapp_logs;
CREATE POLICY "Public Access WhatsApp Logs" ON public.whatsapp_logs FOR ALL USING (true) WITH CHECK (true);

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_phone ON public.whatsapp_logs("recipientPhone");
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_timestamp ON public.whatsapp_logs(timestamp);

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (5, 'whatsapp_integration_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
