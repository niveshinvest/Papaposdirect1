
import { getSupabase, authService } from './supabaseService';

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
    if (!client) return;
    const profile = await authService.getProfile();

    // 1. Create or Get Supplier
    const { data: supplier, error: suppErr } = await client
      .from('suppliers')
      .upsert({ 
        company_id: profile.company_id, 
        name: finalData.vendor_name,
        gstin: finalData.vendor_gstin 
      }, { onConflict: 'company_id, name' })
      .select()
      .single();
    
    if (suppErr) throw new Error(suppErr.message);

    // 2. Create Procurement Order
    const { data: po, error: poErr } = await client
      .from('procurement_orders')
      .insert({
        company_id: profile.company_id,
        outlet_id: outletId,
        supplier_id: supplier?.id,
        order_date: finalData.invoice_date,
        total_amount: finalData.total_amount,
        status: 'RECEIVED'
      })
      .select()
      .single();
    
    if (poErr) throw new Error(poErr.message);

    // 3. Create Items
    const items = finalData.items.map((item: any) => ({
      purchase_order_id: po.id,
      company_id: profile.company_id,
      outlet_id: outletId,
      item_name: item.name,
      qty: item.qty,
      unit: item.unit || 'unit',
      unit_price: item.price,
      total_amount: item.qty * item.price
    }));

    const { error: itemsErr } = await client.from('purchase_items').insert(items);
    if (itemsErr) throw new Error(itemsErr.message);

    // 4. Create Invoice Record
    const { error: invErr } = await client.from('purchase_invoices').insert({
      company_id: profile.company_id,
      purchase_order_id: po.id,
      invoice_number: finalData.invoice_number || 'AI-EXTRACTED',
      invoice_date: finalData.invoice_date,
      supplier_gstin: finalData.vendor_gstin,
      total_amount: finalData.total_amount,
      status: 'UNPAID'
    });
    if (invErr) throw new Error(invErr.message);

    // 5. Mark OCR as Processed
    const { error: ocrErr } = await client.from('ocr_invoice_results').update({ status: 'PROCESSED' }).eq('id', ocrId);
    if (ocrErr) throw new Error(ocrErr.message);
  }
};
