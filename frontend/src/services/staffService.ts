import { getSupabase, authService, getTenantAuthHeaders } from "./supabaseService"
import { UserRole, StaffHistory, StaffUser } from "../types"
import { API_BASE } from "./config"

async function getAuthHeaders() {
  return getTenantAuthHeaders({
    "Content-Type": "application/json",
  })
}

export const staffService = {
  async inviteStaff(payload: {
    email: string
    full_name: string
    role: UserRole
    outlet_ids: string[]
    reason: string
  }) {
    const client = getSupabase()
    const response = await fetch(`${API_BASE}/api/admin/invite-staff`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Failed to invite user")
    }

    const profile = await authService.getProfile()
    if (profile && data.profile_id) {
      await client.from("staff_history").insert({
        company_id: profile.company_id,
        profile_id: data.profile_id,
        actor_id: profile.id,
        event_type: "STATUS_CHANGE",
        old_value: null,
        new_value: {
          profile_id: data.profile_id,
          role: payload.role,
          outlets: payload.outlet_ids,
          state: "invited",
        },
        reason: payload.reason,
      })
    }

    return data
  },

  async resendInvite(_profileId?: string) {
    if (!_profileId) {
      throw new Error("profile_id is required")
    }

    const response = await fetch(`${API_BASE}/api/admin/profile-invites/resend`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ profile_id: _profileId }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || "Failed to resend invite")
    }

    return data
  },

  async getInviteLink(profileId?: string) {
    if (!profileId) {
      throw new Error("profile_id is required")
    }

    const invite = await this.resendInvite(profileId)
    const baseUrl = window.location.origin
    return `${baseUrl}/#/onboarding/${invite.invite_token}`
  },

  async verifyOnboardingToken(token?: string) {
    if (!token) {
      throw new Error("Invite token missing")
    }

    const response = await fetch(`${API_BASE}/auth/verify-invite/${token}`)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Invalid invite token")
    }

    return data
  },

  async fetchStaff(): Promise<StaffUser[]> {
    const response = await fetch(`${API_BASE}/api/admin/staff`, {
      headers: await getAuthHeaders(),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Failed to fetch users")
    }

    return (data || []).map((user: any) => ({
      id: user.profile_id,
      profile_id: user.profile_id,
      full_name: user.name || "Unknown",
      company_id: user.company_id,
      role: user.role,
      outlet_ids: user.outlet_ids || [],
      outlets: user.outlets || [],
      status: user.is_active ? "active" : "disabled",
      created_at: user.created_at || new Date().toISOString(),
      created_by: "",
      permissions: user.permissions || {},
      email: user.email || "",
    }))
  },

  async adminResetPassword(userId: string, newPassword?: string) {
    const endpoint = newPassword
      ? `${API_BASE}/api/admin/reset-user-password`
      : `${API_BASE}/api/admin/send-reset-link`
    const body = newPassword
      ? { user_id: userId, new_password: newPassword }
      : { user_id: userId }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(body),
    })

    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Failed to reset password")
    return result
  },

  async validateDevice(payload: {
    device_fingerprint: string
    device_name: string
    profile_id: string
    outlet_id?: string
  }) {
    const response = await fetch(`${API_BASE}/auth/validate-device`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    return await response.json()
  },

  async approveDevice(deviceId: string) {
    const response = await fetch(`${API_BASE}/api/admin/approve-device`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ device_id: deviceId }),
    })

    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Failed to approve device")
    return result
  },

  async fetchDevices() {
    const client = getSupabase()
    const profile = await authService.getProfile()
    if (!profile || !profile.company_id) return []

    const { data: devices, error } = await client
      .from("devices")
      .select("*, outlets(name)")
      .order("created_at", { ascending: false })

    if (error) throw new Error(error.message)

    const profileIds = (devices || [])
      .map((device: any) => device.profile_id || device.staff_id)
      .filter((id: string | null | undefined): id is string => Boolean(id))

    const { data: profiles } = profileIds.length
      ? await client.from("profiles").select("id, full_name").in("id", profileIds)
      : { data: [] as any[] }

    const profileMap = new Map(
      (profiles || []).map((row: any) => [row.id, row.full_name])
    )

    return (devices || []).map((device: any) => ({
      ...device,
      profile_name: profileMap.get(device.profile_id || device.staff_id) || null,
    }))
  },

  async completeOnboarding(
    token: string,
    password: string,
    pin: string,
    fullName: string
  ) {
    if (!token) throw new Error("Invite token missing")

    const response = await fetch(`${API_BASE}/auth/complete-onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, pin, full_name: fullName }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Failed to complete onboarding")
    }

    return data
  },

  async fetchStaffHistory(profileId: string): Promise<StaffHistory[]> {
    const client = getSupabase()
    const profile = await authService.getProfile()
    if (!profile?.company_id) return []

    const { data, error } = await client
      .from("staff_history")
      .select("*, profiles!actor_id(full_name)")
      .eq("company_id", profile.company_id)
      .contains("new_value", { profile_id: profileId })
      .order("timestamp", { ascending: false })

    if (error) throw new Error(error.message)
    return (data || []).map((row: any) => ({
      ...row,
      actor_name: row.profiles?.full_name,
    }))
  },

  async updateStaffRole(profileId: string, role: UserRole, reason: string) {
    const client = getSupabase()
    const profile = await authService.getProfile()
    if (!profile || !["OWNER", "ADMIN"].includes(profile.role)) {
      throw new Error("Unauthorized: Only Owners or Admins can modify roles.")
    }
    if (!reason) throw new Error("Reason for role change is mandatory.")

    const response = await fetch(`${API_BASE}/api/admin/staff/${profileId}/role`, {
      method: "PATCH",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ role }),
    })

    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Failed to update role")

    await client.from("staff_history").insert({
      company_id: profile.company_id,
      profile_id: profileId,
      actor_id: profile.id,
      event_type: "ROLE_CHANGE",
      old_value: null,
      new_value: { profile_id: profileId, role },
      reason,
    })
  },

  async updateStaffOutlets(profileId: string, outletIds: string[], reason: string) {
    const client = getSupabase()
    const profile = await authService.getProfile()
    if (!profile || !["OWNER", "ADMIN"].includes(profile.role)) {
      throw new Error("Unauthorized: Only Owners or Admins can modify outlet access.")
    }
    if (!reason) throw new Error("Reason for outlet scope change is mandatory.")

    const response = await fetch(`${API_BASE}/api/admin/staff/${profileId}/outlets`, {
      method: "PATCH",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ outlet_ids: outletIds }),
    })

    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Failed to update outlet access")

    await client.from("staff_history").insert({
      company_id: profile.company_id,
      profile_id: profileId,
      actor_id: profile.id,
      event_type: "OUTLET_CHANGE",
      old_value: null,
      new_value: { profile_id: profileId, outlet_ids: outletIds },
      reason,
    })
  },

  async toggleStaffStatus(profileId: string, status: "active" | "disabled", reason: string) {
    const client = getSupabase()
    const profile = await authService.getProfile()
    if (!profile || !["OWNER", "ADMIN"].includes(profile.role)) {
      throw new Error("Unauthorized")
    }
    if (!reason) throw new Error("Reason for status change is mandatory.")

    const response = await fetch(`${API_BASE}/api/admin/staff/${profileId}/status`, {
      method: "PATCH",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ is_active: status === "active" }),
    })

    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Failed to update user status")

    await client.from("staff_history").insert({
      company_id: profile.company_id,
      profile_id: profileId,
      actor_id: profile.id,
      event_type: "STATUS_CHANGE",
      old_value: null,
      new_value: { profile_id: profileId, is_active: status === "active" },
      reason,
    })
  },
}
