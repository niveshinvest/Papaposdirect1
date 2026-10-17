import { useEffect, useMemo, useState } from "react"
import {
  getPermissions,
  getRolePermissions,
  saveRolePermissions,
} from "../services/permissionService"

export default function PermissionEditor({ role }: { role: string }) {
  const [permissions, setPermissions] = useState<any[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const [all, rolePerms] = await Promise.all([
          getPermissions(),
          getRolePermissions(role),
        ])

        const normalizedPermissions = Array.isArray(all) ? all : []
        setPermissions(normalizedPermissions)

        if (role === "OWNER") {
          const ownerDefaults = normalizedPermissions.reduce(
            (acc: Record<string, boolean>, permission: any) => {
              acc[permission.key] = true
              return acc
            },
            { all: true }
          )
          setSelected(ownerDefaults)
        } else {
          setSelected(rolePerms || {})
        }
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [role])

  function toggle(key: string) {
    setSelected((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  async function save() {
    if (role === "OWNER") {
      alert("Owner permissions are always fully enabled.")
      return
    }

    try {
      setSaving(true)
      await saveRolePermissions(role, selected)
      alert("Permissions saved")
    } catch (error: any) {
      alert(error.message || "Failed to save permissions")
    } finally {
      setSaving(false)
    }
  }

  const grouped = useMemo(() => {
    return permissions.reduce((acc: Record<string, any[]>, permission) => {
      if (!acc[permission.module]) acc[permission.module] = []
      acc[permission.module].push(permission)
      return acc
    }, {})
  }, [permissions])

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Role Permissions: {role}</h2>
        <button
          onClick={save}
          disabled={loading || saving || role === "OWNER"}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {role === "OWNER" ? "Locked for Owner" : saving ? "Saving..." : "Save Permissions"}
        </button>
      </div>

      {role === "OWNER" && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Owner always has every permission enabled by default and cannot be reduced from this screen.
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-gray-500">Loading permissions...</div>
      ) : (
        <div className="space-y-4">
          {Object.keys(grouped).map((module) => (
            <div key={module} className="rounded-xl border p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
                {module}
              </h3>

              <div className="grid gap-2 md:grid-cols-2">
                {grouped[module].map((perm: any) => (
                  <label key={perm.key} className="flex items-start gap-3 rounded-lg p-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected[perm.key] || false}
                      onChange={() => toggle(perm.key)}
                      className="mt-1"
                      disabled={role === "OWNER"}
                    />
                    <div>
                      <div className="font-medium text-slate-800">{perm.label}</div>
                      <div className="text-xs text-slate-500">{perm.key}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
