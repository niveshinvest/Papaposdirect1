-- PAPAPOS MIGRATION 097: Extend api_keys for secure storage, status, and rate limits

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS key_hash TEXT,
  ADD COLUMN IF NOT EXISTS key_mask TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rate_limit INTEGER NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_company_active ON public.api_keys(company_id, is_active);

INSERT INTO public.schema_migrations (version, name)
VALUES (97, 'api_keys_alter_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
