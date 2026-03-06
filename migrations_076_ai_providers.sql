-- Migration: AI Provider System
-- Description: Adds ai_providers table for multi-provider AI support

CREATE TABLE IF NOT EXISTS public.ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    provider_name TEXT NOT NULL CHECK (provider_name IN ('gemini', 'openai', 'claude', 'openrouter', 'local')),
    api_key TEXT,
    model_name TEXT NOT NULL,
    base_url TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, provider_name)
);

-- Ensure only one active provider per company
CREATE OR REPLACE FUNCTION public.ensure_single_active_ai_provider()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active THEN
        UPDATE public.ai_providers
        SET is_active = false
        WHERE company_id = NEW.company_id AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_single_active_ai_provider
BEFORE INSERT OR UPDATE ON public.ai_providers
FOR EACH ROW EXECUTE FUNCTION public.ensure_single_active_ai_provider();

-- Insert default Gemini provider for existing companies
INSERT INTO public.ai_providers (company_id, provider_name, model_name, is_active)
SELECT id, 'gemini', 'gemini-pro', true
FROM public.companies
ON CONFLICT DO NOTHING;
