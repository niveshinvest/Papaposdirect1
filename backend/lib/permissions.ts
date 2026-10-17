export const PERMISSION_GROUPS = [
  {
    id: 'sales',
    label: 'Sales',
    permissions: ['sales.read','sales.write','sales.refund','sales.void','sale.edit','sale.delete','sale.override_price']
  },
  {
    id: 'inventory',
    label: 'Inventory',
    permissions: ['inventory.read','inventory.write','inventory.adjust']
  },
  {
    id: 'outlet',
    label: 'Outlet',
    permissions: ['outlet.read','outlet.write']
  },
  {
    id: 'customer',
    label: 'Customers',
    permissions: ['customer.read','customer.write']
  },
  {
    id: 'integrations',
    label: 'Integrations',
    permissions: ['integration.sync','integration.read']
  },
  {
    id: 'admin',
    label: 'Admin',
    permissions: ['admin.read','admin.write']
  }
]

export const FLAT_PERMISSIONS = new Set(PERMISSION_GROUPS.flatMap(g => g.permissions))

export function isValidPermission(p: string) {
  return FLAT_PERMISSIONS.has(String(p))
}

export function validatePermissionsList(perms: any[]): { valid: boolean; invalid: string[] } {
  if (!Array.isArray(perms)) return { valid: false, invalid: [] }
  const invalid = perms.filter(p => !isValidPermission(p)).map(p => String(p))
  return { valid: invalid.length === 0, invalid }
}

export function normalizePermissionsToMap(perms: string[] | Record<string, boolean> | null) {
  const out: Record<string, boolean> = {}
  if (!perms) return out
  if (Array.isArray(perms)) {
    perms.forEach(p => { if (isValidPermission(p)) out[p] = true })
    return out
  }
  // if already a map, sanitize keys
  Object.keys(perms).forEach(k => { if (isValidPermission(k) && (perms as any)[k]) out[k] = true })
  return out
}
