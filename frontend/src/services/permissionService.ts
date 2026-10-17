import { getTenantAuthHeaders } from "./supabaseService"
import { API_BASE } from "./config"

async function getAuthHeaders() {
  return getTenantAuthHeaders({
    "Content-Type": "application/json",
  })
}

export async function getPermissions() {
  const res = await fetch(`${API_BASE}/api/admin/permissions`, {
    headers: await getAuthHeaders(),
  })
  return res.json()
}

export async function getRolePermissions(role: string) {
  const res = await fetch(
    `${API_BASE}/api/admin/role-permissions?role=${role}`,
    {
      headers: await getAuthHeaders(),
    }
  )
  return res.json()
}

export async function saveRolePermissions(
  role: string,
  permissions: any
) {
  const res = await fetch(
    `${API_BASE}/api/admin/role-permissions`,
    {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        role,
        permissions,
      }),
    }
  )

  return res.json()
}
