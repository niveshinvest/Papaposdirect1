import React, { useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Shield,
  User as UserIcon,
  UserPlus,
  X,
} from "lucide-react"
import { usePermissions } from "../hooks/permissions"
import { staffService } from "../services/staffService"
import { cloudOutlets } from "../services/supabaseService"
import { StaffUser, Outlet } from "../types"
import RolePermissions from "./RolePermissions"

const ROLE_OPTIONS = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "KITCHEN_STAFF"]

type ActionState =
  | { type: "role"; user: StaffUser; value: string; reason: string }
  | { type: "outlets"; user: StaffUser; value: string[]; reason: string }
  | { type: "status"; user: StaffUser; value: "active" | "disabled"; reason: string }
  | { type: "reset"; user: StaffUser; value: "link"; reason: string }
  | null

const emptyInviteForm = {
  email: "",
  full_name: "",
  role: "CASHIER",
  outlet_ids: [] as string[],
  reason: "User invited",
}

const toneClasses = {
  shell: "min-h-full bg-slate-50 p-4 md:p-6",
  card: "rounded-[32px] border border-slate-200 bg-white shadow-sm",
  input:
    "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100",
  textarea:
    "min-h-[110px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100",
  primaryButton:
    "inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50",
  secondaryButton:
    "inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50",
}

const UserManagement = () => {
  const { can } = usePermissions()
  const canInvite = can("invite_staff")
  const canEdit = can("edit_staff")
  const canDisable = can("disable_staff")
  const canReset = can("reset_password")
  const canAssignOutlet = can("assign_outlet")

  const [users, setUsers] = useState<StaffUser[]>([])
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [loading, setLoading] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [inviteLink, setInviteLink] = useState("")
  const [inviteForm, setInviteForm] = useState(emptyInviteForm)
  const [actionState, setActionState] = useState<ActionState>(null)
  const [actionSubmitting, setActionSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoading(true)
        const [data, outletData] = await Promise.all([
          staffService.fetchStaff(),
          cloudOutlets.fetchAll(),
        ])
        setUsers(data)
        setOutlets(outletData)
      } catch (err) {
        console.error("Failed to load users", err)
        setUsers([])
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [])

  async function reloadUsers() {
    const data = await staffService.fetchStaff()
    setUsers(data)
  }

  const selectedActionTitle = useMemo(() => {
    if (!actionState) return ""
    if (actionState.type === "role") return "Update role"
    if (actionState.type === "outlets") return "Update outlet access"
    if (actionState.type === "status") {
      return actionState.value === "disabled" ? "Disable staff access" : "Enable staff access"
    }
    return "Reset staff password"
  }, [actionState])

  async function handleInviteUser() {
    if (!inviteForm.email.trim()) {
      alert("Email is required")
      return
    }

    try {
      setInviteSubmitting(true)
      setFeedback(null)
      const result = await staffService.inviteStaff({
        email: inviteForm.email.trim(),
        full_name: inviteForm.full_name.trim(),
        role: inviteForm.role as any,
        outlet_ids: inviteForm.outlet_ids,
        reason: inviteForm.reason.trim() || "User invited",
      })

      await reloadUsers()

      if (result.profile_id) {
        const createdInviteLink = await staffService.getInviteLink(result.profile_id)
        setInviteLink(createdInviteLink)
      }

      setInviteForm(emptyInviteForm)
      setFeedback("Invite created and outlet scope saved.")
    } catch (error: any) {
      alert(error.message || "Failed to invite user")
    } finally {
      setInviteSubmitting(false)
    }
  }

  async function submitAction() {
    if (!actionState?.reason.trim()) {
      alert("Reason is required")
      return
    }

    try {
      setActionSubmitting(true)
      setFeedback(null)

      if (actionState.type === "role") {
        await staffService.updateStaffRole(actionState.user.id, actionState.value as any, actionState.reason.trim())
        setFeedback("Role updated successfully.")
      }

      if (actionState.type === "outlets") {
        await staffService.updateStaffOutlets(actionState.user.id, actionState.value, actionState.reason.trim())
        setFeedback("Outlet access updated successfully.")
      }

      if (actionState.type === "status") {
        await staffService.toggleStaffStatus(actionState.user.id, actionState.value, actionState.reason.trim())
        setFeedback(`Staff access ${actionState.value === "disabled" ? "disabled" : "enabled"} successfully.`)
      }

      if (actionState.type === "reset") {
        await staffService.adminResetPassword(actionState.user.id)
        setFeedback("Password reset link sent successfully.")
      }

      await reloadUsers()
      setActionState(null)
    } catch (error: any) {
      alert(error.message || "Failed to update user")
    } finally {
      setActionSubmitting(false)
    }
  }

  return (
    <div className={toneClasses.shell}>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className={`${toneClasses.card} overflow-hidden`}>
          <div className="bg-slate-900 px-6 py-6 text-white md:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-orange-400">Team control</p>
                <h1 className="text-3xl font-black tracking-tight">Staff, outlet access and terminal readiness</h1>
                <p className="max-w-2xl text-sm font-medium text-slate-300">
                  Keep staff permissions tight, outlet assignments clean and onboarding actions inside the same PapaPOS visual flow.
                </p>
              </div>

              {canInvite && (
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-white transition hover:bg-orange-600"
                  onClick={() => {
                    setInviteLink("")
                    setFeedback(null)
                    setShowInviteForm((current) => !current)
                  }}
                >
                  <UserPlus size={16} />
                  {showInviteForm ? "Close invite form" : "Invite staff"}
                </button>
              )}
            </div>
          </div>

          {feedback && (
            <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-4 text-sm font-bold text-emerald-700 md:px-8">
              {feedback}
            </div>
          )}

          {canInvite && showInviteForm && (
            <div className="border-b border-slate-200 bg-white px-6 py-6 md:px-8">
              <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Email</span>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="email"
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm((current) => ({ ...current, email: e.target.value }))}
                          className={`${toneClasses.input} pl-11`}
                          placeholder="staff@example.com"
                        />
                      </div>
                    </label>

                    <label className="space-y-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Full name</span>
                      <div className="relative">
                        <UserIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="text"
                          value={inviteForm.full_name}
                          onChange={(e) => setInviteForm((current) => ({ ...current, full_name: e.target.value }))}
                          className={`${toneClasses.input} pl-11`}
                          placeholder="Staff name"
                        />
                      </div>
                    </label>

                    <label className="space-y-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Role</span>
                      <select
                        value={inviteForm.role}
                        onChange={(e) => setInviteForm((current) => ({ ...current, role: e.target.value }))}
                        className={toneClasses.input}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 md:col-span-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Reason</span>
                      <div className="relative">
                        <FileText className="pointer-events-none absolute left-4 top-4 text-slate-400" size={16} />
                        <textarea
                          value={inviteForm.reason}
                          onChange={(e) => setInviteForm((current) => ({ ...current, reason: e.target.value }))}
                          className={`${toneClasses.textarea} pl-11`}
                          placeholder="Why this staff member needs access"
                        />
                      </div>
                    </label>
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-2 text-slate-900">
                    <MapPin size={16} className="text-orange-500" />
                    <h2 className="text-sm font-black uppercase tracking-[0.22em]">Outlet access</h2>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    Only the selected outlets will appear after staff sign-in.
                  </p>

                  <div className="mt-4 grid gap-3">
                    {outlets.map((outlet) => {
                      const checked = inviteForm.outlet_ids.includes(outlet.id)
                      return (
                        <label
                          key={outlet.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                            checked
                              ? "border-orange-300 bg-orange-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setInviteForm((current) => ({
                                ...current,
                                outlet_ids: checked
                                  ? current.outlet_ids.filter((id) => id !== outlet.id)
                                  : [...current.outlet_ids, outlet.id],
                              }))
                            }
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-black text-slate-900">{outlet.name}</span>
                            <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                              {outlet.id}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={handleInviteUser} disabled={inviteSubmitting} className={toneClasses.primaryButton}>
                  {inviteSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {inviteSubmitting ? "Creating invite" : "Create invite"}
                </button>

                <button
                  onClick={() => {
                    setShowInviteForm(false)
                    setInviteLink("")
                  }}
                  className={toneClasses.secondaryButton}
                >
                  Cancel
                </button>
              </div>

              {inviteLink && (
                <div className="mt-5 rounded-[28px] border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 size={16} />
                    <p className="text-sm font-black uppercase tracking-[0.22em]">Invite ready</p>
                  </div>
                  <div className="mt-3 flex flex-col gap-3 md:flex-row">
                    <input readOnly value={inviteLink} className={`${toneClasses.input} flex-1 bg-white`} onFocus={(e) => e.currentTarget.select()} />
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(inviteLink)
                        setFeedback("Invite link copied to clipboard.")
                      }}
                      className={toneClasses.secondaryButton}
                    >
                      <Copy size={16} />
                      Copy link
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto px-4 py-4 md:px-6 md:py-6">
            {loading && <div className="py-10 text-center text-sm font-bold text-slate-500">Loading users...</div>}

            {!loading && (
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr className="text-left text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Outlets</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-sm font-semibold text-slate-500">
                        No users found
                      </td>
                    </tr>
                  )}

                  {users.map((user) => (
                    <tr key={user.id} className="align-top">
                      <td className="px-3 py-4">
                        <div className="space-y-1">
                          <p className="text-sm font-black text-slate-900">{user.full_name || user.email || "Unknown"}</p>
                          <p className="text-xs font-semibold text-slate-500">{user.email || "No email available"}</p>
                        </div>
                      </td>

                      <td className="px-3 py-4">
                        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-slate-700">
                          {user.role}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex max-w-md flex-wrap gap-2">
                          {(user.outlets || []).length > 0 ? (
                            user.outlets?.map((outlet) => (
                              <span
                                key={outlet.id}
                                className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-orange-700"
                              >
                                {outlet.name || outlet.id}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm font-semibold text-slate-500">No assigned outlets</span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${
                            user.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          {canEdit && (
                            <button
                              className={toneClasses.secondaryButton}
                              onClick={() =>
                                setActionState({
                                  type: "role",
                                  user,
                                  value: user.role,
                                  reason: `Role updated for ${user.full_name || user.email || "staff user"}`,
                                })
                              }
                            >
                              <Shield size={15} />
                              Role
                            </button>
                          )}

                          {canAssignOutlet && (
                            <button
                              className={toneClasses.secondaryButton}
                              onClick={() =>
                                setActionState({
                                  type: "outlets",
                                  user,
                                  value: user.outlet_ids || [],
                                  reason: `Outlet access updated for ${user.full_name || user.email || "staff user"}`,
                                })
                              }
                            >
                              <MapPin size={15} />
                              Outlets
                            </button>
                          )}

                          {canReset && (
                            <button
                              className={toneClasses.secondaryButton}
                              onClick={() =>
                                setActionState({
                                  type: "reset",
                                  user,
                                  value: "link",
                                  reason: `Password reset initiated for ${user.full_name || user.email || "staff user"}`,
                                })
                              }
                            >
                              <Lock size={15} />
                              Reset
                            </button>
                          )}

                          {canDisable && (
                            <button
                              className={user.status === "active" ? toneClasses.secondaryButton : toneClasses.primaryButton}
                              onClick={() =>
                                setActionState({
                                  type: "status",
                                  user,
                                  value: user.status === "active" ? "disabled" : "active",
                                  reason: `Staff access ${user.status === "active" ? "disabled" : "enabled"} for ${user.full_name || user.email || "staff user"}`,
                                })
                              }
                            >
                              {user.status === "active" ? "Disable" : "Enable"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <div className={toneClasses.card}>
          <RolePermissions />
        </div>
      </div>

      {actionState && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[36px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-500">
                  {actionState.user.full_name || actionState.user.email || "Staff"}
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{selectedActionTitle}</h2>
              </div>
              <button onClick={() => setActionState(null)} className="rounded-2xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              {actionState.type === "role" && (
                <label className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Select role</span>
                  <select
                    value={actionState.value}
                    onChange={(e) => setActionState({ ...actionState, value: e.target.value })}
                    className={toneClasses.input}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {actionState.type === "outlets" && (
                <div className="space-y-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Assigned outlets</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {outlets.map((outlet) => {
                      const checked = actionState.value.includes(outlet.id)
                      return (
                        <label
                          key={outlet.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                            checked ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setActionState({
                                ...actionState,
                                value: checked
                                  ? actionState.value.filter((id) => id !== outlet.id)
                                  : [...actionState.value, outlet.id],
                              })
                            }
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-black text-slate-900">{outlet.name}</span>
                            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{outlet.id}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {actionState.type === "status" && (
                <div className={`rounded-[28px] px-5 py-4 ${
                  actionState.value === "disabled" ? "border border-rose-200 bg-rose-50" : "border border-emerald-200 bg-emerald-50"
                }`}>
                  <p className={`text-sm font-black uppercase tracking-[0.18em] ${
                    actionState.value === "disabled" ? "text-rose-700" : "text-emerald-700"
                  }`}>
                    {actionState.value === "disabled" ? "Access will be blocked" : "Access will be restored"}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    The next sign-in attempt will follow this updated status immediately.
                  </p>
                </div>
              )}

              {actionState.type === "reset" && (
                <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4">
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">Reset link will be sent</p>
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    PapaPOS will trigger the password recovery flow for this staff profile.
                  </p>
                </div>
              )}

              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Reason</span>
                <textarea
                  value={actionState.reason}
                  onChange={(e) => setActionState({ ...actionState, reason: e.target.value })}
                  className={toneClasses.textarea}
                  placeholder="Add the reason for this change"
                />
              </label>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-6 py-5">
              <button onClick={() => setActionState(null)} className={toneClasses.secondaryButton}>
                Cancel
              </button>
              <button onClick={submitAction} disabled={actionSubmitting} className={toneClasses.primaryButton}>
                {actionSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {actionSubmitting ? "Saving" : "Save change"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManagement
