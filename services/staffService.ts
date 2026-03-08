
import { getSupabase, authService } from './supabaseService';
import { UserRole, StaffStatus, StaffHistory, StaffUser } from '../types';

export const staffService = {
  /**
   * Invites new staff and triggers the server-side invitation flow.
   */
  async inviteStaff(payload: {
    email: string;
    full_name: string;
    role: UserRole;
    outlet_ids: string[];
    reason: string;
  }) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    
    if (!profile || !['OWNER', 'ADMIN'].includes(profile.role)) {
      throw new Error("Unauthorized: Only Owners or Admins can invite staff.");
    }

    if (!payload.reason) throw new Error("Compliance Error: Reason for invitation is mandatory.");

    // 1. Create the staff record with 'invited' status and a fresh token
    const { data: staff, error: staffError } = await client
      .from('staff_users')
      .insert({
        email: payload.email,
        full_name: payload.full_name,
        role: payload.role,
        company_id: profile.company_id,
        outlet_ids: payload.outlet_ids,
        status: 'invited',
        is_verified: false,
        created_by: profile.id
      })
      .select()
      .single();

    if (staffError) throw new Error(staffError.message);

    // 2. Trigger the Email dispatch (Server-side Edge Function)
    // We expect an Edge Function 'send-staff-invite' to handle SMTP logic
    try {
      const { error: emailError } = await client.functions.invoke('send-staff-invite', {
        body: { 
          staff_id: staff.id,
          token: staff.invite_token,
          company_name: profile.companies?.name,
          role: payload.role,
          recipient_email: payload.email,
          recipient_name: payload.full_name,
          subject: "Your POS Access – Action Required"
        }
      });

      if (emailError) {
        // Mark as pending if email failed so admin knows they need to retry
        await client.from('staff_users').upsert({ id: staff.id, status: 'invited', updated_at: new Date().toISOString() });
        throw new Error("Staff added but invite email failed. Retry required.");
      }
    } catch (e) {
      // In demo environment, we log the failure but allow the record to exist
      console.warn("Edge Function call failed. Ensure Supabase Functions are deployed.", e);
      throw new Error("Staff added but invite email system is unreachable. Resend manually from team list.");
    }

    // 3. Log Audit Trail
    await client.from('staff_history').insert({
      company_id: profile.company_id,
      staff_id: staff.id,
      actor_id: profile.id,
      event_type: 'STATUS_CHANGE',
      old_value: null,
      new_value: 'invited',
      reason: payload.reason
    });

    return staff;
  },

  async resendInvite(staffId: string) {
    const client = getSupabase();
    const { data: tokenData, error: tokenError } = await client.rpc('generate_staff_invite_token', { p_staff_id: staffId });
    if (tokenError) throw tokenError;

    const { data: staff } = await client.from('staff_users').select('*').eq('id', staffId).single();
    const profile = await authService.getProfile();

    const { error: emailError } = await client.functions.invoke('send-staff-invite', {
      body: { 
        staff_id: staffId,
        token: tokenData.token,
        company_name: profile?.companies?.name,
        role: staff.role,
        recipient_email: staff.email,
        recipient_name: staff.full_name,
        subject: "Your POS Access – Action Required"
      }
    });

    if (emailError) throw new Error("Email delivery failed.");
    return true;
  },

  async getInviteLink(staffId: string): Promise<string> {
    const client = getSupabase();
    const { data: staff } = await client.from('staff_users').select('invite_token').eq('id', staffId).single();
    if (!staff?.invite_token) throw new Error("No active invite token found.");
    
    const baseUrl = window.location.origin;
    return `${baseUrl}/#/onboarding/${staff.invite_token}`;
  },

  async fetchStaff() {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile) return [];

    const { data, error } = await client
      .from('staff_users')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async verifyOnboardingToken(token: string) {
    const client = getSupabase();
    const { data, error } = await client
      .from('staff_users')
      .select('*, companies(name)')
      .eq('invite_token', token)
      .gt('token_expires_at', new Date().toISOString())
      .eq('is_verified', false)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async completeOnboarding(token: string, password: string, pin: string) {
    const client = getSupabase();
    
    // First, complete the profile data via RPC
    const { data, error: rpcError } = await client.rpc('complete_staff_onboarding', {
        p_token: token,
        p_new_password: password, // In production, this would also trigger a supabase auth update
        p_pos_pin: pin
    });

    if (rpcError) throw rpcError;

    // Second, update the Auth user's password (this requires the user to be signed in or admin access)
    // For this flow, we assume the staff is using the token to set their credentials.
    return data;
  },

  async fetchStaffHistory(staffId: string): Promise<StaffHistory[]> {
    const client = getSupabase();
    const { data, error } = await client
      .from('staff_history')
      .select('*, profiles!actor_id(full_name)')
      .eq('staff_id', staffId)
      .order('timestamp', { ascending: false });

    if (error) throw new Error(error.message);
    return (data || []).map(row => ({
      ...row,
      actor_name: row.profiles?.full_name
    }));
  },

  /**
   * Updates staff role with compliance logging.
   */
  async updateStaffRole(staffId: string, role: UserRole, reason: string) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile || !['OWNER', 'ADMIN'].includes(profile.role)) {
      throw new Error("Unauthorized: Only Owners or Admins can modify roles.");
    }
    if (!reason) throw new Error("Compliance Error: Reason for role change is mandatory.");

    const { data: oldStaff, error: fetchError } = await client
      .from('staff_users')
      .select('role')
      .eq('id', staffId)
      .single();
    if (fetchError) throw new Error(fetchError.message);

    const { error: updateError } = await client
      .from('staff_users')
      .upsert({ id: staffId, role, updated_at: new Date().toISOString() });

    if (updateError) throw new Error(updateError.message);

    // Log to staff history for traceability
    await client.from('staff_history').insert({
      company_id: profile.company_id,
      staff_id: staffId,
      actor_id: profile.id,
      event_type: 'ROLE_CHANGE',
      old_value: oldStaff?.role,
      new_value: role,
      reason: reason
    });
  },

  /**
   * Updates staff outlet scope with compliance logging.
   */
  async updateStaffOutlets(staffId: string, outletIds: string[], reason: string) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile || !['OWNER', 'ADMIN'].includes(profile.role)) {
      throw new Error("Unauthorized: Only Owners or Admins can modify outlet access.");
    }
    if (!reason) throw new Error("Compliance Error: Reason for outlet scope change is mandatory.");

    const { data: oldStaff, error: fetchError } = await client
      .from('staff_users')
      .select('outlet_ids')
      .eq('id', staffId)
      .single();
    if (fetchError) throw new Error(fetchError.message);

    const { error: updateError } = await client
      .from('staff_users')
      .upsert({ id: staffId, outlet_ids: outletIds, updated_at: new Date().toISOString() });

    if (updateError) throw new Error(updateError.message);

    // Log to staff history for traceability
    await client.from('staff_history').insert({
      company_id: profile.company_id,
      staff_id: staffId,
      actor_id: profile.id,
      event_type: 'OUTLET_CHANGE',
      old_value: oldStaff?.outlet_ids,
      new_value: outletIds,
      reason: reason
    });
  },

  async toggleStaffStatus(staffId: string, status: StaffStatus, reason: string) {
    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile || !['OWNER', 'ADMIN'].includes(profile.role)) throw new Error("Unauthorized");
    if (!reason) throw new Error("Compliance Error: Reason for status change is mandatory.");

    const { data: oldStaff, error: fetchError } = await client.from('staff_users').select('status').eq('id', staffId).single();
    if (fetchError) throw new Error(fetchError.message);

    const { error } = await client
      .from('staff_users')
      .upsert({ id: staffId, status, updated_at: new Date().toISOString() });

    if (error) throw new Error(error.message);

    await client.from('staff_history').insert({
      company_id: profile.company_id,
      staff_id: staffId,
      actor_id: profile.id,
      event_type: 'STATUS_CHANGE',
      old_value: oldStaff?.status,
      new_value: status,
      reason
    });
  }
};
