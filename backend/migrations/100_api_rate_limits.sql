-- PAPAPOS MIGRATION 100: api_rate_limits table + helper function

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL,
  company_id UUID NOT NULL,
  outlet_id UUID,
  window_type TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_key_window ON public.api_rate_limits(api_key_id, window_type, window_start);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_company_outlet ON public.api_rate_limits(company_id, outlet_id);

-- Atomic upsert function: increments request_count atomically and returns new count
CREATE OR REPLACE FUNCTION public.upsert_api_rate_limit(
  p_api_key_id UUID,
  p_company_id UUID,
  p_outlet_id UUID,
  p_window_type TEXT,
  p_window_start TIMESTAMPTZ,
  p_increment INT
) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  LOOP
    -- try update first
    UPDATE public.api_rate_limits
    SET request_count = request_count + p_increment,
        updated_at = NOW()
    WHERE api_key_id = p_api_key_id
      AND window_type = p_window_type
      AND window_start = p_window_start
    RETURNING request_count INTO v_count;

    IF FOUND THEN
      RETURN v_count;
    END IF;

    -- not found: attempt insert
    BEGIN
      INSERT INTO public.api_rate_limits(api_key_id, company_id, outlet_id, window_type, window_start, request_count, updated_at)
      VALUES (p_api_key_id, p_company_id, p_outlet_id, p_window_type, p_window_start, p_increment, NOW());
      RETURN p_increment;
    EXCEPTION WHEN unique_violation THEN
      -- concurrent insert, loop and try update again
    END;
  END LOOP;
END;
$$;

INSERT INTO public.schema_migrations (version, name)
VALUES (100, 'api_rate_limits_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
