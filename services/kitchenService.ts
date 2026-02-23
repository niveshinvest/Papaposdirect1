
import { getSupabase, authService } from './supabaseService';

export const kitchenService = {
  /**
   * Fetches active kitchen tickets for the current outlet.
   */
  async fetchActiveTickets(outletId: string) {
    const client = getSupabase();
    if (!client) return [];
    
    const { data, error } = await client
      .from('kitchen_orders')
      .select('*')
      .eq('outlet_id', outletId)
      .in('status', ['PENDING', 'PREPARING', 'READY'])
      .order('created_at', { ascending: true });
      
    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Transitions a kitchen order to a new state and logs the event via RPC.
   */
  async updateTicketStatus(ticketId: string, currentStatus: string, nextStatus: string) {
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
        status: 'PENDING'
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
};
