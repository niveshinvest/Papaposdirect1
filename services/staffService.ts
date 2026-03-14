
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
    const { data: { session } } = await client.auth.getSession();
    
    if (!session) {
      throw new Error("Authentication required");
    }

    const response = await fetch('/api/admin/invite-staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to invite staff");
    }

    const data = await response.json();

    // Log Audit Trail (Client side for now, or move to backend)
    const profile = await authService.getProfile();
    if (profile) {
      await client.from('staff_history').insert({
        company_id: profile.company_id,
        staff_id: data.staff_id,
        actor_id: profile.id,
        event_type: 'STATUS_CHANGE',
        old_value: null,
        new_value: 'invited',
        reason: payload.reason
      });
    }

    return data;
  },

  async resendInvite(staffId: string) {
    const client = getSupabase();
    const { data: { session } } = await client.auth.getSession();
    
    if (!session) {
      throw new Error("Authentication required");
    }

    const response = await fetch('/api/admin/resend-staff-invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ staff_id: staffId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to resend invite");
    }

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
    if (!profile || !profile.company_id) return [];

    const { data, error } = await client
      .from('staff_users')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async adminResetPassword(userId: string, newPassword?: string) {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Unauthorized");

    const endpoint = newPassword ? '/api/admin/reset-user-password' : '/api/admin/send-reset-link';
    const body = newPassword ? { user_id: userId, new_password: newPassword } : { user_id: userId };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Failed to reset password");
    return result;
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

  async completeOnboarding(token: string, email: string, password: string, pin: string, fullName: string) {
    const client = getSupabase();
    
    // 1. Update the Auth User
    // Since we now create the user during invite, we just update their password and metadata
    // They should be logged in via the magic link already.
    const { error: authError } = await client.auth.updateUser({
      password: password,
      data: { full_name: fullName }
    });

    if (authError) {
      // Fallback: If update fails, they might need to sign up (legacy flow)
      const { error: signUpError } = await client.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });
      if (signUpError && !signUpError.message.includes('already registered')) {
        throw signUpError;
      }
    }

    // 2. Complete the profile data via RPC
    // This transitions staff_users status to 'active' and sets the PIN
    const { data, error: rpcError } = await client.rpc('complete_staff_onboarding', {
        p_token: token,
        p_new_password: password, 
        p_pos_pin: pin
    });

    if (rpcError) throw rpcError;

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
    if (!profile.company_id) {
      throw new Error("Tenant context missing: Please select a company.");
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
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', staffId);

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
    if (!profile.company_id) {
      throw new Error("Tenant context missing: Please select a company.");
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
      .update({ outlet_ids: outletIds, updated_at: new Date().toISOString() })
      .eq('id', staffId);

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
    if (!profile.company_id) {
      throw new Error("Tenant context missing: Please select a company.");
    }
    if (!reason) throw new Error("Compliance Error: Reason for status change is mandatory.");

    const { data: oldStaff, error: fetchError } = await client.from('staff_users').select('status').eq('id', staffId).single();
    if (fetchError) throw new Error(fetchError.message);

    const { error } = await client
      .from('staff_users')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', staffId);

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
