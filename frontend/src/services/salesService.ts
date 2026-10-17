
import { getSupabase, authService } from './supabaseService';
import { MenuItem, CartItem, Invoice, Modifier } from '../types';

const hasPermission = (profile: any, permission: string) =>
  Boolean(profile?.permissions?.all || profile?.permissions?.[permission] || profile?.is_owner);

const requirePermission = (profile: any, permission: string) => {
  if (!hasPermission(profile, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
};

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
   * Finalizes a sale with full GST compliance via server-side RPC.
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

    const { data, error } = await client.rpc('settle_bill', {
      p_order_id: payload.orderId,
      p_outlet_id: payload.outletId,
      p_items: payload.items,
      p_payment_method: payload.paymentMethod,
      p_customer_state_code: payload.customerStateCode
    });

    if (error) throw new Error(error.message);

    return { 
      invoiceNo: data.invoiceNo, 
      grandTotal: data.grandTotal 
    };
  },

  /**
   * Fetches an invoice with its line items for review or editing.
   */
  async getInvoiceWithItems(invoiceId: string) {
    console.log("Fetching invoice with items for ID:", invoiceId);
    const client = getSupabase();
    if (!client) throw new Error("Supabase required");

    const { data: invoice, error: invError } = await client
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', invoiceId)
      .single();

    if (invError) throw new Error(invError.message);
    return invoice;
  },

  async getSaleAuditHistory(invoiceId: string) {
    const client = getSupabase();
    if (!client) throw new Error("Supabase required");

    const { data, error } = await client
      .from('sales_audit_log')
      .select('*, profiles:performed_by(full_name,email)')
      .eq('sale_id', invoiceId)
      .order('performed_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Securely edits an invoice, updates KOT, and records audit log via RPC.
   */
  async editInvoice(payload: {
    invoiceId: string,
    newSubtotal: number,
    newTotalTax: number,
    newGrandTotal: number,
    newItems: any[],
    editReason: string
  }) {
    const client = getSupabase();
    if (!client) throw new Error("Supabase required");

    const profile = await authService.getProfile();
    if (!profile) throw new Error("Authentication required");
    requirePermission(profile, 'sale.edit');

    const { data, error } = await client.rpc('edit_invoice', {
      p_invoice_id: payload.invoiceId,
      p_new_subtotal: payload.newSubtotal,
      p_new_total_tax: payload.newTotalTax,
      p_new_grand_total: payload.newGrandTotal,
      p_new_items: payload.newItems,
      p_edit_reason: payload.editReason,
      p_actor_id: profile.id
    });

    if (error) throw new Error(error.message);
    return data || true;
  },

  async deleteInvoice(invoiceId: string, reason: string) {
    const client = getSupabase();
    if (!client) throw new Error("Supabase required");

    const profile = await authService.getProfile();
    if (!profile) throw new Error("Authentication required");
    requirePermission(profile, 'sale.delete');

    if (!reason?.trim()) throw new Error("Reason for deletion is required");

    const { data, error } = await client.rpc('delete_invoice', {
      p_invoice_id: invoiceId,
      p_delete_reason: reason.trim(),
      p_actor_id: profile.id
    });

    if (error) throw new Error(error.message);
    return data || true;
  }
};
