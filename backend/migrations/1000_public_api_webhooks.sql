-- Add API keys, webhook endpoints, deliveries, sync failures, event queue
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  outlet_ids jsonb DEFAULT '[]'::jsonb,
  permissions jsonb DEFAULT '[]'::jsonb,
  key_hash text NOT NULL UNIQUE,
  key_mask text,
  is_active boolean DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_company_idx ON api_keys (company_id);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text,
  url text NOT NULL,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  secret text,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_endpoint_id uuid,
  event text,
  status integer,
  response_body text,
  delivered_at timestamptz DEFAULT now(),
  company_id uuid,
  outlet_id text,
  resource_id text,
  attempt integer DEFAULT 1
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_idx ON webhook_deliveries (webhook_endpoint_id);

CREATE TABLE IF NOT EXISTS sync_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_endpoint_id uuid,
  event text,
  payload jsonb,
  last_error text,
  attempts integer DEFAULT 0,
  next_attempt_at timestamptz DEFAULT now(),
  dead_letter boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Ensure column exists for upgrades where the table was created earlier without this column
ALTER TABLE IF EXISTS sync_failures ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz DEFAULT now();
ALTER TABLE IF EXISTS sync_failures ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0;
ALTER TABLE IF EXISTS sync_failures ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE IF EXISTS sync_failures ADD COLUMN IF NOT EXISTS dead_letter boolean DEFAULT false;
ALTER TABLE IF EXISTS sync_failures ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS sync_failures_next_idx ON sync_failures (next_attempt_at);

CREATE TABLE IF NOT EXISTS event_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  module text,
  company_id uuid,
  outlet_id text,
  resource_id text,
  payload jsonb,
  created_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS event_queue_company_idx ON event_queue (company_id);
