
import { getSupabase, authService } from './supabaseService';
import { MenuItem, CartItem, Invoice, Modifier } from '../types';

export const salesService = {
  /**
   * Core GST Engine: Calculates accurate item-level taxes based on inclusive/exclusive settings
   * and intra/inter-state rules. Supports per-item GST rates.
   */
  calculateItemGst(item: MenuItem, quantity: number, outletState: string, destState: string, gstRegistered: boolean = true, selectedModifiers?: Modifier[]): CartItem {
    const isInterState = outletState !== destState;
    // Single source of truth for rate and mode
    const rate = gstRegistered ? Number(item.tax_percentage ?? item.gst_rate ?? 5) : 0;
    const modeInclusive = Boolean(item.price_includes_tax ?? item.is_tax_inclusive ?? false);
    
    const modifierPrice = (selectedModifiers || []).reduce((sum, mod) => sum + mod.price, 0);
    const unitPrice = Number(item.base_price ?? item.price) + modifierPrice;
    
    let taxableValue: number;
    let totalTax: number;
    let lineTotal: number;

    if (!gstRegistered) {
      // Non-GST: Price is the total, tax is 0
      taxableValue = unitPrice * quantity;
      totalTax = 0;
      lineTotal = taxableValue;
    } else if (modeInclusive) {
      // MRP Style: Total is fixed, taxable value is derived backwards
      lineTotal = unitPrice * quantity;
      taxableValue = lineTotal * 100 / (100 + rate);
      totalTax = lineTotal - taxableValue;
    } else {
      // Exclusive Style: Price is the taxable value, tax is added on top
      taxableValue = unitPrice * quantity;
      totalTax = (taxableValue * rate) / 100;
      lineTotal = taxableValue + totalTax;
    }

    const cgst = isInterState ? 0 : totalTax / 2;
    const sgst = isInterState ? 0 : totalTax / 2;
    const igst = isInterState ? totalTax : 0;

    return {
      ...item,
      quantity,
      selected_modifiers: selectedModifiers,
      taxable_value: parseFloat(taxableValue.toFixed(4)),
      cgst_amount: parseFloat(cgst.toFixed(2)),
      sgst_amount: parseFloat(sgst.toFixed(2)),
      igst_amount: parseFloat(igst.toFixed(2)),
      total_amount: parseFloat(lineTotal.toFixed(2))
    };
  },

  /**
   * Generates the next FY-compliant invoice number from the database sequence.
   */
  async getNextInvoiceNumber(outletId: string): Promise<string> {
    const client = getSupabase();
    const { data, error } = await client.rpc('get_next_invoice_number', { p_outlet_id: outletId });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Finalizes a sale with full GST compliance.
   */
  async settleBill(payload: {
    orderId: string,
    outletId: string,
    items: { id: string, quantity: number, selected_modifiers?: Modifier[] }[],
    paymentMethod: string,
    customerStateCode?: string
  }) {
    const client = getSupabase();
    if (!client) throw new Error("Supabase required");
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    // 1. Resolve Outlet and Destination State
    const { data: outlet } = await client.from('outlets').select('*').eq('id', payload.outletId).single();
    if (!outlet) throw new Error("Outlet mapping failed");

    const gstRegistered = outlet.gst_registered ?? false;
    const outletState = outlet.gst_state_code || outlet.state_code || '27';
    const destState = payload.customerStateCode || outletState;
    const isInterState = outletState !== destState;

    // 2. Fetch Fresh Menu Data for calculation
    const itemIds = payload.items.map(i => i.id);
    const { data: menuItems } = await client.from('menu_items').select('*').in('id', itemIds);
    if (!menuItems) throw new Error("Menu items sync error");

    // 3. Perform accurate GST calculations
    const processedItems: CartItem[] = payload.items.map(cartReq => {
      const menu = menuItems.find(m => m.id === cartReq.id);
      if (!menu) throw new Error(`Item ${cartReq.id} missing in catalog`);
      return this.calculateItemGst(menu, cartReq.quantity, outletState, destState, gstRegistered, cartReq.selected_modifiers);
    });

    // 4. Aggregate Totals
    const subtotal = processedItems.reduce((acc, i) => acc + i.taxable_value, 0);
    const cgstTotal = processedItems.reduce((acc, i) => acc + i.cgst_amount, 0);
    const sgstTotal = processedItems.reduce((acc, i) => acc + i.sgst_amount, 0);
    const igstTotal = processedItems.reduce((acc, i) => acc + i.igst_amount, 0);
    const totalTax = cgstTotal + sgstTotal + igstTotal;
    const rawGrandTotal = subtotal + totalTax;
    const grandTotal = Math.round(rawGrandTotal);
    const roundOff = parseFloat((grandTotal - rawGrandTotal).toFixed(2));

    // Determine order's primary GST rate (weighted or max)
    const primaryGstRate = processedItems.length > 0 ? processedItems[0].tax_percentage : 5.0;

    // 5. Generate FY Number
    const invoiceNo = await this.getNextInvoiceNumber(payload.outletId);

    // 6. DB TRANSACTION: Create Invoice with standardizeed GST fields
    const { data: invoice, error: invErr } = await client
      .from('invoices')
      .insert({
        company_id: profile.company_id,
        outlet_id: payload.outletId,
        order_id: payload.orderId,
        invoice_number: invoiceNo,
        billing_state_code: destState,
        outlet_state_code: outletState,
        taxable_value: parseFloat(subtotal.toFixed(2)), // Standards compliance: mapped from subtotal
        subtotal: parseFloat(subtotal.toFixed(2)),
        cgst_amount: cgstTotal,
        sgst_amount: sgstTotal,
        igst_amount: igstTotal,
        total_tax: parseFloat(totalTax.toFixed(2)),
        round_off: roundOff,
        grand_total: grandTotal,
        total_amount: grandTotal, // Standards compliance: mapped from grand_total
        gst_rate: primaryGstRate,
        gst_type: isInterState ? 'IGST' : 'CGST_SGST',
        payment_method: payload.paymentMethod
      })
      .select()
      .single();

    if (invErr) throw new Error(invErr.message);

    // 7. DB TRANSACTION: Create Invoice Items (Audit Log)
    const invoiceItemRows = processedItems.map(item => ({
      invoice_id: invoice.id,
      menu_item_id: item.id,
      quantity: item.quantity,
      selected_modifiers: item.selected_modifiers,
      taxable_value: item.taxable_value,
      cgst_amount: item.cgst_amount,
      sgst_amount: item.sgst_amount,
      igst_amount: item.igst_amount,
      total_amount: item.total_amount
    }));

    const { error: itemsErr } = await client.from('invoice_items').insert(invoiceItemRows);
    if (itemsErr) throw new Error(itemsErr.message);

    // 8. Update Order Status
    const { error: orderErr } = await client.from('orders').update({ status: 'completed' }).eq('id', payload.orderId);
    if (orderErr) throw new Error(orderErr.message);

    return { invoiceNo, grandTotal };
  }
};
