-- PAPAPOS MIGRATION 091: PRINTER PREFERENCES MULTI ROUTE
-- Target: Supabase / Postgres
-- Description: Upgrades printer routing to support multiple printers and named paper sizes.

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

INSERT INTO public.schema_migrations (version, name)
VALUES (91, 'printer_preferences_multi_route')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
