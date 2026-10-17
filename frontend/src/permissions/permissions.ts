export const PERMISSION_GROUPS = [
  {
    id: 'sales',
    label: 'Sales',
    permissions: [
      { id: 'sales.read', label: 'sales.read' },
      { id: 'sales.write', label: 'sales.write' },
      { id: 'sales.refund', label: 'sales.refund' },
      { id: 'sales.void', label: 'sales.void' },
      { id: 'sale.edit', label: 'sale.edit' },
      { id: 'sale.delete', label: 'sale.delete' },
      { id: 'sale.override_price', label: 'sale.override_price' }
    ]
  },
  {
    id: 'inventory',
    label: 'Inventory',
    permissions: [
      { id: 'inventory.read', label: 'inventory.read' },
      { id: 'inventory.write', label: 'inventory.write' },
      { id: 'inventory.adjust', label: 'inventory.adjust' }
    ]
  },
  {
    id: 'outlet',
    label: 'Outlet',
    permissions: [
      { id: 'outlet.read', label: 'outlet.read' },
      { id: 'outlet.write', label: 'outlet.write' }
    ]
  },
  {
    id: 'customer',
    label: 'Customers',
    permissions: [
      { id: 'customer.read', label: 'customer.read' },
      { id: 'customer.write', label: 'customer.write' }
    ]
  },
  {
    id: 'integrations',
    label: 'Integrations',
    permissions: [
      { id: 'integration.sync', label: 'integration.sync' },
      { id: 'integration.read', label: 'integration.read' }
    ]
  },
  {
    id: 'admin',
    label: 'Admin',
    permissions: [
      { id: 'admin.read', label: 'admin.read' },
      { id: 'admin.write', label: 'admin.write' }
    ],
    warning: 'High privilege access'
  }
]

export const FLAT_PERMISSIONS = new Set(PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id)))

export function isValidPermission(p: string) {
  return FLAT_PERMISSIONS.has(String(p))
}

export function validatePermissionsList(perms: any[]): { valid: boolean; invalid: string[] } {
  if (!Array.isArray(perms)) return { valid: false, invalid: [] }
  const invalid = perms.filter(p => !isValidPermission(p)).map(p => String(p))
  return { valid: invalid.length === 0, invalid }
}
