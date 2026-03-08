
-- PAPAPOS MIGRATION 049: ALERT DELIVERY ENGINE
-- Target: Supabase / Postgres

-- 1. NOTIFICATION PREFERENCES ON COMPANIES
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{
    "whatsapp_enabled": true,
    "email_enabled": true,
    "quiet_hours_start": "23:00",
    "quiet_hours_end": "07:00",
    "min_severity": "MEDIUM"
}'::jsonb;

-- 2. ALERT DELIVERIES TABLE (AUDIT TRAIL)
CREATE TYPE delivery_channel AS ENUM ('WHATSAPP', 'EMAIL', 'DASHBOARD');
CREATE TYPE delivery_status AS ENUM ('SENT', 'DELIVERED', 'FAILED', 'RETRYING');

CREATE TABLE IF NOT EXISTS public.alert_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    insight_id UUID NOT NULL REFERENCES public.ai_insights(id) ON DELETE CASCADE,
    channel delivery_channel NOT NULL,
    status delivery_status NOT NULL DEFAULT 'SENT',
    recipient_identity TEXT NOT NULL, -- email address or phone number
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SECURITY (RLS)
ALTER TABLE public.alert_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner Delivery View" ON public.alert_deliveries
    FOR SELECT TO authenticated
    USING (
        company_id = public.get_my_company_id() 
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'OWNER')
    );

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_insight ON public.alert_deliveries(insight_id);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_status ON public.alert_deliveries(status) WHERE status = 'FAILED';

-- 5. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (49, 'alert_delivery_engine_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
