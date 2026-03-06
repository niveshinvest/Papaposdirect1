-- Migration: AI Provider System
-- Description: Adds ai_providers table for multi-provider AI support

CREATE TABLE IF NOT EXISTS public.ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name TEXT NOT NULL,
    api_key TEXT,
    base_url TEXT,
    model TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT false,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, provider_name)
);

-- Handle transition from model_name to model if table already exists
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_providers' AND column_name='model_name') THEN
        ALTER TABLE public.ai_providers RENAME COLUMN model_name TO model;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_providers' AND column_name='is_default') THEN
        ALTER TABLE public.ai_providers ADD COLUMN is_default BOOLEAN DEFAULT false;
    END IF;

    -- Drop old constraint if it exists
    ALTER TABLE public.ai_providers DROP CONSTRAINT IF EXISTS ai_providers_provider_name_check;
END $$;

-- Ensure only one provider can be default per company
CREATE OR REPLACE FUNCTION public.ensure_single_default_ai_provider()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default THEN
        UPDATE public.ai_providers
        SET is_default = false
        WHERE company_id = NEW.company_id AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_single_default_ai_provider
BEFORE INSERT OR UPDATE ON public.ai_providers
FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_ai_provider();

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
INSERT INTO public.ai_providers (company_id, provider_name, model, is_default, is_active)
SELECT id, 'gemini', 'gemini-pro', true, true
FROM public.companies
ON CONFLICT DO NOTHING;
