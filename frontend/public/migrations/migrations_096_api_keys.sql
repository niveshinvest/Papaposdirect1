-- PAPAPOS MIGRATION 096: API KEYS TABLE (company + outlet restrictions)
-- Target: Supabase / Postgres

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  outlet_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  permissions JSONB NOT NULL DEFAULT '{}'::JSONB,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_company ON public.api_keys(company_id);

-- Mark migration as applied
INSERT INTO public.schema_migrations (version, name)
VALUES (96, 'api_keys_table_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
