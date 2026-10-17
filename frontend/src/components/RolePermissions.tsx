import { useState } from "react"
import PermissionEditor from "./PermissionEditor"

const ROLE_OPTIONS = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "KITCHEN_STAFF"]

export default function RolePermissions() {
  const [role, setRole] = useState("MANAGER")

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="mb-3 text-xl font-semibold">Role Permissions</h1>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-lg border px-3 py-2"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <PermissionEditor role={role} />
    </div>
  )
}
