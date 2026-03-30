import { supabaseAdmin } from "../lib/supabaseAdmin"

type RoleRow = {
  id: string
  role: string
}

type PermissionRecord = {
  id: string
  key?: string | null
  code?: string | null
  name?: string | null
}

type CompanyMembership = {
  id: string
  company_id: string
  profile_id: string
  role: string
  permissions?: Record<string, boolean> | null
}

type OutletMembership = {
  id: string
  outlet_id: string
  profile_id: string
  role: string
  permissions?: Record<string, boolean> | null
}

type OutletRow = {
  id: string
}

type RolePermissionRow = {
  permission?: PermissionRecord | PermissionRecord[] | null
}

function normalizeRoleName(role: string | null | undefined) {
  return String(role || "").toUpperCase()
}

function normalizePermissionKey(
  permission: PermissionRecord | PermissionRecord[] | null | undefined
) {
  const resolved = Array.isArray(permission) ? permission[0] : permission
  return resolved?.key || resolved?.code || resolved?.name || null
}

function buildPermissionMap(keys: string[]) {
  return keys.reduce<Record<string, boolean>>((acc, key) => {
    if (!key) return acc
    acc[key] = true
    if (key === "all") {
      acc.all = true
    }
    return acc
  }, {})
}

function mergePermissionMaps(
  ...maps: Array<Record<string, boolean> | null | undefined>
) {
  return maps.reduce<Record<string, boolean>>((acc, map) => {
    if (!map) return acc
    return { ...acc, ...map }
  }, {})
}

async function fetchRolePermissions(companyId: string, roleName: string) {
  const normalizedRoleName = normalizeRoleName(roleName)

  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from("roles")
    .select("id, role")
    .eq("company_id", companyId)
    .eq("role", normalizedRoleName)

  if (roleError) {
    throw new Error(`Failed to resolve role record: ${roleError.message}`)
  }

  const roleRow = (roleRows || [])[0] as RoleRow | undefined

  if (!roleRow?.id) {
    return {}
  }

  const { data, error } = await supabaseAdmin
    .from("role_permissions")
    .select("permission:permissions(id, key, code, name)")
    .eq("company_id", companyId)
    .eq("role_id", roleRow.id)

  if (error) {
    throw new Error(`Failed to resolve role permissions: ${error.message}`)
  }

  const keys = (data || [])
    .map((row: RolePermissionRow) => normalizePermissionKey(row.permission))
    .filter((key): key is string => Boolean(key))

  return buildPermissionMap(keys)
}

export async function resolveAccess(
  userId: string,
  context?: { companyId?: string | null; outletId?: string | null }
) {
  const requestedCompanyId = context?.companyId || null
  const requestedOutletId = context?.outletId || null

  const { data: ownerRows, error: ownerError } = await supabaseAdmin
    .from("owners")
    .select("company_id")
    .eq("profile_id", userId)

  if (ownerError) {
    throw new Error(`Failed to resolve owner override: ${ownerError.message}`)
  }

  const ownerCompanyIds = new Set((ownerRows || []).map((row) => row.company_id))

  const { data: membershipRows, error: membershipError } = await supabaseAdmin
    .from("company_users")
    .select("id, company_id, profile_id, role, permissions")
    .eq("profile_id", userId)

  if (membershipError) {
    throw new Error(`Failed to resolve company membership: ${membershipError.message}`)
  }

  if (!membershipRows?.length) {
    throw new Error("Access denied: profile is not mapped to any company")
  }

  const companyMemberships = membershipRows as CompanyMembership[]
  const activeCompanyMembership =
    companyMemberships.find((membership) => membership.company_id === requestedCompanyId) ||
    companyMemberships[0]

  if (requestedCompanyId && requestedCompanyId !== activeCompanyMembership.company_id) {
    throw new Error("Access denied: requested company is not assigned to this profile")
  }

  const membershipRole = normalizeRoleName(activeCompanyMembership.role)
  const isOwnerOverride = ownerCompanyIds.has(activeCompanyMembership.company_id)
  const rolePermissions = isOwnerOverride
    ? { all: true }
    : await fetchRolePermissions(activeCompanyMembership.company_id, membershipRole)

  const { data: outletRows, error: outletError } = await supabaseAdmin
    .from("outlet_users")
    .select("id, outlet_id, profile_id, role, permissions")
    .eq("profile_id", userId)

  if (outletError) {
    throw new Error(`Failed to resolve outlet membership: ${outletError.message}`)
  }

  const { data: companyOutletRows, error: companyOutletsError } = await supabaseAdmin
    .from("outlets")
    .select("id")
    .eq("company_id", activeCompanyMembership.company_id)

  if (companyOutletsError) {
    throw new Error(`Failed to resolve company outlets: ${companyOutletsError.message}`)
  }

  const companyOutletIds = new Set(
    ((companyOutletRows || []) as OutletRow[]).map((outlet) => outlet.id)
  )
  const rawOutletMemberships = (outletRows || []) as OutletMembership[]
  const outletMemberships = rawOutletMemberships.filter((membership) =>
    companyOutletIds.has(membership.outlet_id)
  )

  if (
    requestedOutletId &&
    !companyOutletIds.has(requestedOutletId)
  ) {
    throw new Error("Access denied: requested outlet does not belong to the active company")
  }

  if (
    requestedOutletId &&
    !isOwnerOverride &&
    !outletMemberships.some((membership) => membership.outlet_id === requestedOutletId)
  ) {
    throw new Error("Access denied: requested outlet is not assigned to this profile")
  }

  const companyPermissions = mergePermissionMaps(
    rolePermissions,
    activeCompanyMembership.permissions || {}
  )

  const ownerOutletMemberships = ((companyOutletRows || []) as OutletRow[]).map((outlet) => ({
    id: `owner-${activeCompanyMembership.company_id}-${outlet.id}`,
    outlet_id: outlet.id,
    profile_id: userId,
    role: "OWNER",
    permissions: { all: true },
  }))
  const effectiveOutletMemberships = isOwnerOverride
    ? ownerOutletMemberships
    : outletMemberships

  const activeOutletMembership =
    effectiveOutletMemberships.find(
      (membership) => membership.outlet_id === requestedOutletId
    ) ||
    effectiveOutletMemberships[0] ||
    null

  const effectivePermissions = mergePermissionMaps(
    companyPermissions,
    activeOutletMembership?.permissions || {}
  )

  const activeOutletId = activeOutletMembership?.outlet_id || null

  return {
    user_id: userId,
    profile_id: userId,
    company_user_id: activeCompanyMembership.id,
    company_id: activeCompanyMembership.company_id,
    outlet_id: activeOutletId,
    role: isOwnerOverride ? "OWNER" : membershipRole,
    is_owner: isOwnerOverride || membershipRole === "OWNER",
    permissions: effectivePermissions,
    company: {
      id: activeCompanyMembership.company_id,
    },
    companies: companyMemberships.map((membership) => ({
      id: membership.company_id,
      role: ownerCompanyIds.has(membership.company_id)
        ? "OWNER"
        : normalizeRoleName(membership.role),
      company_user_id: membership.id,
      permissions: membership.permissions || {},
      is_active: membership.company_id === activeCompanyMembership.company_id,
      is_owner: ownerCompanyIds.has(membership.company_id),
    })),
    outlets: effectiveOutletMemberships.map((membership) => ({
      id: membership.outlet_id,
      role: isOwnerOverride ? "OWNER" : normalizeRoleName(membership.role),
      permissions: mergePermissionMaps(companyPermissions, membership.permissions || {}),
      is_active: membership.outlet_id === activeOutletId,
    })),
  }
}
