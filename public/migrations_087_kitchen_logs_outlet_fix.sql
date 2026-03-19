-- PAPAPOS MIGRATION 087: FIX KDS RPC LOG INSERT (OUTLET_ID NOT NULL)
-- Target: Supabase / Postgres
-- Description: Ensures update_kitchen_ticket_status inserts outlet_id into kitchen_status_logs.

CREATE OR REPLACE FUNCTION public.update_kitchen_ticket_status(
    p_ticket_id UUID,
    p_current_status TEXT,
    p_next_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    v_company_id UUID;
    v_user_id UUID;
    v_outlet_id TEXT;
BEGIN
    -- Get current user context
    v_user_id := auth.uid();

    -- Resolve tenant context from ticket
    SELECT company_id, outlet_id
      INTO v_company_id, v_outlet_id
      FROM public.kitchen_orders
     WHERE id = p_ticket_id;

    IF v_company_id IS NULL OR v_outlet_id IS NULL OR NOT EXISTS (
        SELECT 1
          FROM public.profiles
         WHERE id = v_user_id
           AND company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Ticket access denied or user not found.';
    END IF;

    -- 1. Update ticket state
    UPDATE public.kitchen_orders
       SET status = p_next_status,
           updated_at = NOW()
     WHERE id = p_ticket_id;

    -- 2. Log transition with outlet_id (required by schema)
    INSERT INTO public.kitchen_status_logs (
        kitchen_order_id,
        company_id,
        outlet_id,
        status_from,
        status_to,
        user_id
    ) VALUES (
        p_ticket_id,
        v_company_id,
        v_outlet_id,
        p_current_status,
        p_next_status,
        v_user_id
    );
END;
$func$;

INSERT INTO public.schema_migrations (version, name)
VALUES (87, 'kitchen_logs_outlet_not_null_fix_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
