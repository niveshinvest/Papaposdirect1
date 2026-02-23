
-- PAPAPOS MIGRATION 064: KDS SERVER-SIDE LOGIC
-- Target: Supabase / Postgres
-- Description: Implements RPC for kitchen ticket status updates to comply with production architecture rules (No browser PATCH).

-- 1. RPC FUNCTION: UPDATE KITCHEN STATUS
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
BEGIN
    -- Get current user context
    v_user_id := auth.uid();
    
    -- Verify user belongs to the same company as the ticket
    SELECT company_id INTO v_company_id 
    FROM public.kitchen_orders 
    WHERE id = p_ticket_id;

    IF v_company_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = v_user_id AND company_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Ticket access denied or user not found.';
    END IF;

    -- 1. Update the ticket
    UPDATE public.kitchen_orders
    SET 
        status = p_next_status,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- 2. Log the transition
    INSERT INTO public.kitchen_status_logs (
        kitchen_order_id,
        company_id,
        status_from,
        status_to,
        user_id
    ) VALUES (
        p_ticket_id,
        v_company_id,
        p_current_status,
        p_next_status,
        v_user_id
    );

END;
$func$;

-- 2. RPC FUNCTION: SETTLE BILL (ATOMIC TRANSACTION)
CREATE OR REPLACE FUNCTION public.settle_bill(
    p_order_id TEXT,
    p_outlet_id TEXT,
    p_items JSONB, -- Array of {id, quantity, selected_modifiers}
    p_payment_method TEXT,
    p_customer_state_code TEXT DEFAULT NULL
)
RETURNS JSONB 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $func$
DECLARE
    v_company_id UUID;
    v_user_id UUID;
    v_invoice_id UUID;
    v_invoice_no TEXT;
    v_outlet_state TEXT;
    v_dest_state TEXT;
    v_is_inter_state BOOLEAN;
    v_subtotal NUMERIC := 0;
    v_cgst_total NUMERIC := 0;
    v_sgst_total NUMERIC := 0;
    v_igst_total NUMERIC := 0;
    v_total_tax NUMERIC := 0;
    v_grand_total NUMERIC := 0;
    v_round_off NUMERIC := 0;
    v_item RECORD;
    v_menu_item RECORD;
    v_mod RECORD;
    v_mod_price NUMERIC;
    v_unit_price NUMERIC;
    v_taxable_value NUMERIC;
    v_line_tax NUMERIC;
    v_line_total NUMERIC;
    v_rate NUMERIC;
    v_mode_inclusive BOOLEAN;
    v_gst_registered BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    
    -- Get company and outlet info
    SELECT company_id, gst_state_code, state_code, gst_registered 
    INTO v_company_id, v_outlet_state, v_dest_state, v_gst_registered
    FROM public.outlets WHERE id = p_outlet_id;
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Outlet not found.';
    END IF;

    v_outlet_state := COALESCE(v_outlet_state, v_dest_state, '27');
    v_dest_state := COALESCE(p_customer_state_code, v_outlet_state);
    v_is_inter_state := v_outlet_state <> v_dest_state;
    v_gst_registered := COALESCE(v_gst_registered, FALSE);

    -- 1. Generate Invoice Number
    v_invoice_no := public.get_next_invoice_number(p_outlet_id);

    -- 2. Create Invoice Shell (will update totals later)
    INSERT INTO public.invoices (
        company_id, outlet_id, order_id, invoice_number, 
        billing_state_code, outlet_state_code, payment_method,
        subtotal, total_tax, grand_total
    ) VALUES (
        v_company_id, p_outlet_id, p_order_id, v_invoice_no,
        v_dest_state, v_outlet_state, p_payment_method,
        0, 0, 0
    ) RETURNING id INTO v_invoice_id;

    -- 3. Process Items and Calculate Taxes
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id UUID, quantity NUMERIC, selected_modifiers JSONB)
    LOOP
        SELECT * INTO v_menu_item FROM public.menu_items WHERE id = v_item.id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Item % not found', v_item.id; END IF;

        v_mod_price := 0;
        IF v_item.selected_modifiers IS NOT NULL THEN
            FOR v_mod IN SELECT * FROM jsonb_to_recordset(v_item.selected_modifiers) AS m(price NUMERIC)
            LOOP
                v_mod_price := v_mod_price + COALESCE(v_mod.price, 0);
            END LOOP;
        END IF;

        v_unit_price := COALESCE(v_menu_item.base_price, v_menu_item.price, 0) + v_mod_price;
        v_rate := CASE WHEN v_gst_registered THEN COALESCE(v_menu_item.tax_percentage, v_menu_item.gst_rate, 5) ELSE 0 END;
        v_mode_inclusive := COALESCE(v_menu_item.price_includes_tax, v_menu_item.is_tax_inclusive, FALSE);

        IF NOT v_gst_registered THEN
            v_taxable_value := v_unit_price * v_item.quantity;
            v_line_tax := 0;
            v_line_total := v_taxable_value;
        ELSIF v_mode_inclusive THEN
            v_line_total := v_unit_price * v_item.quantity;
            v_taxable_value := v_line_total * 100 / (100 + v_rate);
            v_line_tax := v_line_total - v_taxable_value;
        ELSE
            v_taxable_value := v_unit_price * v_item.quantity;
            v_line_tax := (v_taxable_value * v_rate) / 100;
            v_line_total := v_taxable_value + v_line_tax;
        END IF;

        -- Accumulate Totals
        v_subtotal := v_subtotal + v_taxable_value;
        v_total_tax := v_total_tax + v_line_tax;
        
        IF v_is_inter_state THEN
            v_igst_total := v_igst_total + v_line_tax;
        ELSE
            v_cgst_total := v_cgst_total + (v_line_tax / 2);
            v_sgst_total := v_sgst_total + (v_line_tax / 2);
        END IF;

        -- Insert Invoice Item
        INSERT INTO public.invoice_items (
            invoice_id, menu_item_id, quantity, selected_modifiers,
            taxable_value, cgst_amount, sgst_amount, igst_amount, total_amount,
            company_id, outlet_id
        ) VALUES (
            v_invoice_id, v_item.id, v_item.quantity, v_item.selected_modifiers,
            v_taxable_value, 
            CASE WHEN v_is_inter_state THEN 0 ELSE v_line_tax / 2 END,
            CASE WHEN v_is_inter_state THEN 0 ELSE v_line_tax / 2 END,
            CASE WHEN v_is_inter_state THEN v_line_tax ELSE 0 END,
            v_line_total,
            v_company_id, p_outlet_id
        );
    END LOOP;

    -- 4. Finalize Totals and Rounding
    v_grand_total := ROUND(v_subtotal + v_total_tax);
    v_round_off := v_grand_total - (v_subtotal + v_total_tax);

    UPDATE public.invoices SET
        subtotal = ROUND(v_subtotal, 2),
        taxable_value = ROUND(v_subtotal, 2),
        cgst_amount = ROUND(v_cgst_total, 2),
        sgst_amount = ROUND(v_sgst_total, 2),
        igst_amount = ROUND(v_igst_total, 2),
        total_tax = ROUND(v_total_tax, 2),
        round_off = ROUND(v_round_off, 2),
        grand_total = v_grand_total,
        total_amount = v_grand_total
    WHERE id = v_invoice_id;

    -- 5. Update Order Status
    UPDATE public.orders SET status = 'completed' WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'invoiceNo', v_invoice_no,
        'grandTotal', v_grand_total
    );
END;
$func$;

-- 3. HARDEN RLS: REMOVE DIRECT UPDATE ACCESS FOR AUTHENTICATED ROLE
-- This enforces the use of the RPC
DROP POLICY IF EXISTS "Kitchen management" ON public.kitchen_orders;
CREATE POLICY "Kitchen management" ON public.kitchen_orders 
    FOR INSERT WITH CHECK (company_id = public.get_my_company_id());

-- 4. RECORD VERSION
INSERT INTO public.schema_migrations (version, name) 
VALUES (64, 'kds_rpc_hardening_v1')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
