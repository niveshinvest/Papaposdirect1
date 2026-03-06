-- Migration: POS Edit Audit System
-- Description: Adds RPC for secure invoice editing with audit logging

CREATE OR REPLACE FUNCTION public.edit_invoice(
    p_invoice_id UUID,
    p_new_subtotal DECIMAL,
    p_new_total_tax DECIMAL,
    p_new_grand_total DECIMAL,
    p_new_items JSONB,
    p_edit_reason TEXT,
    p_actor_id UUID
) RETURNS VOID AS $$
DECLARE
    v_original_data JSONB;
    v_company_id UUID;
    v_outlet_id UUID;
BEGIN
    -- 1. Fetch original data and context
    SELECT 
        jsonb_build_object(
            'invoice', to_jsonb(i.*),
            'items', (SELECT jsonb_agg(to_jsonb(ii.*)) FROM public.invoice_items ii WHERE ii.invoice_id = i.id)
        ),
        i.company_id,
        i.outlet_id
    INTO v_original_data, v_company_id, v_outlet_id
    FROM public.invoices i
    WHERE i.id = p_invoice_id;

    IF v_original_data IS NULL THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    -- 2. Record Audit Log
    INSERT INTO public.pos_order_audit (
        company_id,
        outlet_id,
        order_id,
        original_data,
        edited_data,
        edit_reason,
        edited_by
    ) VALUES (
        v_company_id,
        v_outlet_id,
        p_invoice_id,
        v_original_data,
        jsonb_build_object(
            'subtotal', p_new_subtotal,
            'total_tax', p_new_total_tax,
            'grand_total', p_new_grand_total,
            'items', p_new_items
        ),
        p_edit_reason,
        p_actor_id
    );

    -- 3. Update Invoice Header
    UPDATE public.invoices
    SET 
        subtotal = p_new_subtotal,
        total_tax = p_new_total_tax,
        grand_total = p_new_grand_total,
        updated_at = NOW()
    WHERE id = p_invoice_id;

    -- 4. Update Invoice Items
    -- Delete old items
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

    -- Insert new items
    INSERT INTO public.invoice_items (
        company_id,
        outlet_id,
        invoice_id,
        menu_item_id,
        item_name,
        quantity,
        unit_price,
        tax_percentage,
        tax_amount,
        total_amount
    )
    SELECT 
        v_company_id,
        v_outlet_id,
        p_invoice_id,
        (item->>'menu_item_id')::UUID,
        (item->>'item_name'),
        (item->>'quantity')::DECIMAL,
        (item->>'unit_price')::DECIMAL,
        (item->>'tax_percentage')::DECIMAL,
        (item->>'tax_amount')::DECIMAL,
        (item->>'total_amount')::DECIMAL
    FROM jsonb_array_elements(p_new_items) AS item;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
