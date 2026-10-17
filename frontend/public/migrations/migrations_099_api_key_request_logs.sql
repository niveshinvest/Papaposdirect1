-- PAPAPOS MIGRATION 099: API Key Request Logs

CREATE TABLE IF NOT EXISTS public.api_key_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_api_key_request_logs_api_key ON public.api_key_request_logs(api_key_id, created_at DESC);

INSERT INTO public.schema_migrations (version, name)
VALUES (99, 'api_key_request_logs_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
