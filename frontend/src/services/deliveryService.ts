
import { getSupabase, authService } from './supabaseService';

export const deliveryService = {
  /**
   * Resolves the correct price for an item based on the sales channel.
   * If a delivery-specific override exists, it is used. Otherwise, fallback to base menu price.
   */
  async resolveItemPrice(payload: {
    menu_item_id: string;
    partner_id: string;
    outlet_id: string;
  }): Promise<{ price: number; isOverride: boolean }> {
    const client = getSupabase();
    if (!client) throw new Error("Cloud connection lost");

    // 1. Check for Channel-Specific Override
    const { data: override } = await client
      .from('delivery_partner_prices')
      .select('override_price')
      .eq('menu_item_id', payload.menu_item_id)
      .eq('partner_id', payload.partner_id)
      .eq('outlet_id', payload.outlet_id)
      .eq('is_active', true)
      .maybeSingle();

    if (override) {
      return { price: Number(override.override_price), isOverride: true };
    }

    // 2. Fallback to Base Menu Price (READ-ONLY Dependency on Menu module)
    const { data: baseItem } = await client
      .from('menu_items')
      .select('base_price')
      .eq('id', payload.menu_item_id)
      .single();

    return { price: Number(baseItem?.base_price || 0), isOverride: false };
  },

  /**
   * Sets or updates a pricing override for a delivery partner.
   */
  async updateOverridePrice(payload: {
    outlet_id: string;
    partner_id: string;
    menu_item_id: string;
    price: number;
  }) {
    const client = getSupabase();
    if (!client) return;
    const profile = await authService.getProfile();

    const { error } = await client
      .from('delivery_partner_prices')
      .upsert({
        company_id: profile.company_id,
        outlet_id: payload.outlet_id,
        partner_id: payload.partner_id,
        menu_item_id: payload.menu_item_id,
        override_price: payload.price,
        updated_at: new Date().toISOString()
      }, { onConflict: 'outlet_id, partner_id, menu_item_id' });

    if (error) throw new Error(error.message);
  },

  /**
   * Fetches all overrides for an outlet/partner to show in the pricing matrix.
   */
  async fetchPricingMatrix(outletId: string, partnerId: string) {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
      .from('delivery_partner_prices')
      .select('*, menu_items(name, base_price)')
      .eq('outlet_id', outletId)
      .eq('partner_id', partnerId);

    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Records an inbound delivery order with price audit data.
   */
  async ingestOrder(orderData: any) {
    const client = getSupabase();
    if (!client) return;
    const profile = await authService.getProfile();

    const { data: order, error: orderErr } = await client
      .from('delivery_orders')
      .insert({
        company_id: profile.company_id,
        outlet_id: orderData.outlet_id,
        partner_id: orderData.partner_id,
        external_order_id: orderData.external_id,
        customer_name: orderData.customer,
        subtotal: orderData.subtotal,
        total_tax: orderData.tax,
        grand_total: orderData.total,
        status: 'ACCEPTED'
      })
      .select()
      .single();

    if (orderErr) throw new Error(orderErr.message);

    // Create line items with double-pricing audit
    const items = orderData.items.map((item: any) => ({
      order_id: order.id,
      menu_item_id: item.menu_item_id,
      item_name: item.name,
      qty: item.qty,
      base_menu_price: item.base_price, // Snapshot of walk-in price
      charged_price: item.charged_price, // What the partner app charged
      total_amount: item.qty * item.charged_price
    }));

    const { error: itemsErr } = await client.from('delivery_order_items').insert(items);
    if (itemsErr) throw new Error(itemsErr.message);
    
    return order;
  }
};
