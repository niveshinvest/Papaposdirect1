-- PAPAPOS MIGRATION 098: Add rate_limit_window to api_keys

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS rate_limit_window TEXT NOT NULL DEFAULT 'day';

INSERT INTO public.schema_migrations (version, name)
VALUES (98, 'api_keys_rate_window_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
