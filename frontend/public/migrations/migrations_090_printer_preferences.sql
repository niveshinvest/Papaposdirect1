-- PAPAPOS MIGRATION 090: PRINTER PREFERENCES
-- Target: Supabase / Postgres
-- Description: Stores outlet-wise bill/KOT printer routing and paper-size preferences.

CREATE TABLE IF NOT EXISTS public.printer_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id TEXT NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
    bill_printer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    bill_paper_size TEXT NULL,
    bill_auto_print BOOLEAN NOT NULL DEFAULT FALSE,
    kot_printer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    kot_paper_size TEXT NULL,
    kot_auto_print BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_printer_preferences_per_outlet UNIQUE (company_id, outlet_id)
);

ALTER TABLE public.printer_preferences
    ADD COLUMN IF NOT EXISTS bill_printer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS bill_paper_size TEXT NULL,
    ADD COLUMN IF NOT EXISTS kot_printer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS kot_paper_size TEXT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'printer_preferences' AND column_name = 'bill_printer_id'
    ) THEN
        EXECUTE '
            UPDATE public.printer_preferences
            SET bill_printer_ids = CASE
                WHEN bill_printer_id IS NULL THEN COALESCE(bill_printer_ids, ''[]''::jsonb)
                ELSE jsonb_build_array(bill_printer_id::text)
            END
            WHERE COALESCE(jsonb_array_length(bill_printer_ids), 0) = 0
        ';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'printer_preferences' AND column_name = 'kot_printer_id'
    ) THEN
        EXECUTE '
            UPDATE public.printer_preferences
            SET kot_printer_ids = CASE
                WHEN kot_printer_id IS NULL THEN COALESCE(kot_printer_ids, ''[]''::jsonb)
                ELSE jsonb_build_array(kot_printer_id::text)
            END
            WHERE COALESCE(jsonb_array_length(kot_printer_ids), 0) = 0
        ';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'printer_preferences' AND column_name = 'bill_paper_width'
    ) THEN
        EXECUTE '
            UPDATE public.printer_preferences
            SET bill_paper_size = COALESCE(bill_paper_size, bill_paper_width)
            WHERE bill_paper_size IS NULL
        ';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'printer_preferences' AND column_name = 'kot_paper_width'
    ) THEN
        EXECUTE '
            UPDATE public.printer_preferences
            SET kot_paper_size = COALESCE(kot_paper_size, kot_paper_width)
            WHERE kot_paper_size IS NULL
        ';
    END IF;
END $$;

ALTER TABLE public.printer_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Printer Preferences Tenant Isolation" ON public.printer_preferences;
CREATE POLICY "Printer Preferences Tenant Isolation"
ON public.printer_preferences
FOR ALL
TO authenticated
USING (
    company_id = public.get_my_company_id()
)
WITH CHECK (
    company_id = public.get_my_company_id()
);

CREATE INDEX IF NOT EXISTS idx_printer_preferences_outlet ON public.printer_preferences(outlet_id);
CREATE INDEX IF NOT EXISTS idx_printer_preferences_company ON public.printer_preferences(company_id);

DROP TRIGGER IF EXISTS update_printer_preferences_updated_at ON public.printer_preferences;
CREATE TRIGGER update_printer_preferences_updated_at
    BEFORE UPDATE ON public.printer_preferences
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

INSERT INTO public.schema_migrations (version, name)
VALUES (90, 'printer_preferences')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
