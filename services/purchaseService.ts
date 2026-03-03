
import { getSupabase, authService, tenantContext } from './supabaseService';

export const purchaseService = {
  async fetchSuppliers() {
    const client = getSupabase();
    if (!client) return [];
    const { data, error } = await client
      .from('suppliers')
      .select('*')
      .order('name');
    if (error) throw new Error(error.message);
    return data || [];
  },

  async fetchProcurementOrders(outletId?: string) {
    const client = getSupabase();
    if (!client) return [];
    let query = client
      .from('procurement_orders')
      .select('*, suppliers(name), purchase_items(*)');
    
    if (outletId) query = query.eq('outlet_id', outletId);
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async fetchOcrQueue() {
    const client = getSupabase();
    if (!client) return [];
    const { data, error } = await client
      .from('ocr_invoice_results')
      .select('*')
      .eq('status', 'PENDING_REVIEW')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async saveSupplier(supplier: any) {
    const client = getSupabase();
    if (!client) return;
    const profile = await authService.getProfile();
    const { data, error } = await client
      .from('suppliers')
      .upsert({ ...supplier, company_id: profile.company_id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async commitOcrResult(ocrId: string, finalData: any, outletId: string) {
    const client = getSupabase();
    if (!client) throw new Error("Database connection required");
    
    const { company_id } = await tenantContext.require();

    if (!finalData || !finalData.items) {
      throw new Error("Invalid OCR data: items missing");
    }

    // 1. Create or Get Supplier
    const { data: supplier, error: suppErr } = await client
      .from('suppliers')
      .upsert({ 
        company_id, 
        name: finalData.vendor_name || 'Unknown Vendor',
        gstin: finalData.vendor_gstin 
      }, { onConflict: 'company_id, name' })
      .select()
      .single();
    
    if (suppErr) throw new Error(`Supplier Error: ${suppErr.message}`);

    // 2. Create Procurement Order
    const { data: po, error: poErr } = await client
      .from('procurement_orders')
      .insert({
        company_id,
        outlet_id: outletId,
        supplier_id: supplier?.id,
        order_date: finalData.invoice_date || new Date().toISOString().split('T')[0],
        total_amount: finalData.total_amount || 0,
        status: 'RECEIVED'
      })
      .select()
      .single();
    
    if (poErr) throw new Error(`Order Error: ${poErr.message}`);

    // 3. Create Items
    const items = finalData.items.map((item: any) => ({
      purchase_order_id: po.id,
      company_id,
      outlet_id: outletId,
      item_name: item.name || 'Unnamed Item',
      qty: Number(item.qty) || 0,
      unit: item.unit || 'unit',
      unit_price: Number(item.price) || 0,
      total_amount: (Number(item.qty) || 0) * (Number(item.price) || 0)
    }));

    const { error: itemsErr } = await client.from('purchase_items').insert(items);
    if (itemsErr) throw new Error(`Items Error: ${itemsErr.message}`);

    // FIX START
    for (const item of items) {
      let { data: invItem } = await client
        .from('inventory')
        .select('id')
        .eq('company_id', company_id)
        .eq('outlet_id', outletId)
        .ilike('name', item.item_name)
        .maybeSingle();

      if (!invItem) {
        const { data: newInv } = await client
          .from('inventory')
          .insert({
            id: `INV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            company_id,
            outlet_id: outletId,
            name: item.item_name,
            unit: item.unit
          })
          .select('id')
          .single();
        invItem = newInv;
      }

      if (invItem) {
        const { data: batch } = await client
          .from('inventory_batches')
          .insert({
            company_id,
            outlet_id: outletId,
            item_id: invItem.id,
            batch_code: finalData.invoice_number || 'PURCHASE',
            initial_qty: item.qty,
            current_qty: item.qty,
            cost_price: item.unit_price,
            created_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (batch) {
          await client.from('inventory_ledger').insert({
            company_id,
            outlet_id: outletId,
            item_id: invItem.id,
            batch_id: batch.id,
            transaction_type: 'STOCK_IN',
            qty_change: item.qty,
            balance_after: item.qty,
            reason: `Purchase: ${finalData.invoice_number || 'N/A'}`,
            created_at: new Date().toISOString()
          });
        }
      }
    }
    // FIX END

    // 4. Create Invoice Record
    const { error: invErr } = await client.from('purchase_invoices').insert({
      company_id,
      purchase_order_id: po.id,
      invoice_number: finalData.invoice_number || 'AI-EXTRACTED',
      invoice_date: finalData.invoice_date || new Date().toISOString().split('T')[0],
      supplier_gstin: finalData.vendor_gstin,
      total_amount: finalData.total_amount || 0,
      status: 'UNPAID'
    });
    if (invErr) throw new Error(`Invoice Error: ${invErr.message}`);

    // 5. Mark OCR as Processed
    const { error: ocrErr } = await client.from('ocr_invoice_results').update({ status: 'PROCESSED' }).eq('id', ocrId);
    if (ocrErr) throw new Error(`OCR Status Error: ${ocrErr.message}`);
  }
};
