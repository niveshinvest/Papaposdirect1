
import { getSupabase, authService } from './supabaseService';

export const kitchenService = {
  /**
   * Fetches active kitchen tickets for the current outlet.
   */
  async fetchActiveTickets(outletId: string) {
    const client = getSupabase();
    if (!client) return [];
    const profile = await authService.getProfile();
    if (!profile?.company_id) return [];
    
    const { data, error } = await client
      .from('kitchen_orders')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId)
      .in('status', ['PENDING', 'PREPARING', 'READY'])
      .order('created_at', { ascending: false });
      
    if (error) throw new Error(error.message);
    const tickets = data || [];

    try {
      // Fetch categories to allow inheriting modifiers when tickets don't include item-level modifiers
      const { data: cats } = await client
        .from('menu_categories')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('outlet_id', outletId);

      const categories = cats || [];

      // Augment each ticket's items with category modifiers when applicable
      const normalized = tickets.map((t: any) => {
        if (!Array.isArray(t.items)) return t;
        const items = t.items.map((it: any) => {
          // If item already has selected_modifiers, keep as-is
          if (Array.isArray(it.selected_modifiers) && it.selected_modifiers.length > 0) return it;

          // If item-level modifiers exist, but none selected, leave empty
          if (Array.isArray(it.modifiers) && it.modifiers.length > 0) return it;

          // Otherwise, if item allows category inheritance, apply category modifiers
          if (it.apply_category_modifiers === false) return it;

          const cat = categories.find((c: any) => c.id === it.category_id || c.name === it.category || (it.menu_categories && it.menu_categories.name === c.name));
          const catMods = cat && Array.isArray(cat.modifiers) ? cat.modifiers : [];
          if (catMods.length > 0) {
            return { ...it, selected_modifiers: catMods };
          }
          return it;
        });
        return { ...t, items };
      });

      return normalized;
    } catch (e) {
      // If augmentation fails, return original tickets
      return tickets;
    }
  },

  /**
   * Transitions a kitchen order to a new state.
   * Enforces company_id and outlet_id filters.
   */
  async updateTicketStatus(ticketId: string, currentStatus: string, nextStatus: string, outletId: string) {
    const client = getSupabase();
    if (!client) return;
    const { error } = await client.rpc('update_kitchen_ticket_status', {
      p_ticket_id: ticketId,
      p_current_status: currentStatus,
      p_next_status: nextStatus
    });
      
    if (error) throw new Error(error.message);
  },

  /**
   * Deletes a kitchen ticket.
   * Enforces company_id and outlet_id filters.
   */
  async deleteTicket(ticketId: string, outletId: string) {
    const client = getSupabase();
    if (!client) return;
    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error("Unauthorized");

    const { error } = await client
      .from('kitchen_orders')
      .delete()
      .eq('id', ticketId)
      .eq('company_id', profile.company_id)
      .eq('outlet_id', outletId);

    if (error) throw new Error(error.message);
  },

  /**
   * Creates a new kitchen ticket (Internal module call).
   */
  async createTicket(payload: {
    order_id: string,
    outlet_id: string,
    table_name?: string,
    items: any[],
    priority?: 'NORMAL' | 'URGENT'
  }) {
    const client = getSupabase();
    if (!client) return;
    const profile = await authService.getProfile();
    if (!profile) throw new Error("Unauthorized");

    const { data, error } = await client
      .from('kitchen_orders')
      .insert({
        company_id: profile.company_id,
        outlet_id: payload.outlet_id,
        order_id: payload.order_id,
        table_name: payload.table_name || 'Takeaway',
        items: payload.items,
        priority: payload.priority || 'NORMAL',
        status: 'PENDING',
        staff_user_id: profile.id
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
};
