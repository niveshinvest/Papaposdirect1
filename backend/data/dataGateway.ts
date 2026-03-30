import { supabaseAdmin } from "../lib/supabaseAdmin"

type Operation = "select" | "insert" | "update" | "upsert" | "delete"

type QueryFilter = {
  operator: "eq" | "in" | "gt" | "gte" | "lt" | "lte" | "ilike" | "contains" | "is"
  column: string
  value: any
}

function isDefinedQueryValue(value: any) {
  return value !== undefined
}

type QueryOrder = {
  column: string
  ascending?: boolean
  nullsFirst?: boolean
  foreignTable?: string
}

type TableRule = {
  companyColumn?: string
  outletColumn?: string
  permissions?: Partial<Record<Operation, string[]>>
  roles?: Partial<Record<Operation, string[]>>
  allowAnonymousRead?: boolean
}

type RpcRule = {
  permissions?: string[]
  roles?: string[]
  companyArg?: string
  outletArgs?: string[]
}

const STAFF_MANAGEMENT_ROLES = ["OWNER", "ADMIN"]
const OPERATIONS_ROLES = ["OWNER", "ADMIN", "MANAGER"]
const STAFF_ROLES = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "KITCHEN_STAFF", "INVESTOR"]

const TABLE_RULES: Record<string, TableRule> = {
  profiles: {
    companyColumn: "company_id",
    permissions: {
      update: ["invite_staff"],
      upsert: ["invite_staff"],
    },
    roles: {
      select: STAFF_ROLES,
      update: STAFF_MANAGEMENT_ROLES,
      upsert: STAFF_MANAGEMENT_ROLES,
    },
  },
  company_users: {
    companyColumn: "company_id",
    permissions: { select: ["invite_staff"], update: ["invite_staff"], upsert: ["invite_staff"] },
    roles: { select: STAFF_MANAGEMENT_ROLES, update: STAFF_MANAGEMENT_ROLES, upsert: STAFF_MANAGEMENT_ROLES },
  },
  outlet_users: {
    outletColumn: "outlet_id",
    permissions: { update: ["invite_staff"], upsert: ["invite_staff"], delete: ["invite_staff"] },
    roles: { select: STAFF_ROLES, update: STAFF_MANAGEMENT_ROLES, upsert: STAFF_MANAGEMENT_ROLES, delete: STAFF_MANAGEMENT_ROLES },
  },
  profile_invites: {
    companyColumn: "company_id",
    permissions: { select: ["invite_staff"], update: ["invite_staff"], upsert: ["invite_staff"] },
    roles: { select: STAFF_MANAGEMENT_ROLES, update: STAFF_MANAGEMENT_ROLES, upsert: STAFF_MANAGEMENT_ROLES },
  },
  staff_history: {
    companyColumn: "company_id",
    permissions: { select: ["invite_staff"], insert: ["invite_staff"] },
    roles: { select: STAFF_MANAGEMENT_ROLES, insert: STAFF_MANAGEMENT_ROLES },
  },
  devices: {
    outletColumn: "outlet_id",
    permissions: { select: ["invite_staff"], update: ["invite_staff"], insert: ["invite_staff"] },
    roles: { select: STAFF_MANAGEMENT_ROLES, update: STAFF_MANAGEMENT_ROLES, insert: STAFF_MANAGEMENT_ROLES },
  },
  permissions: {
    permissions: { select: ["invite_staff"] },
    roles: { select: STAFF_MANAGEMENT_ROLES },
  },
  roles: {
    companyColumn: "company_id",
    permissions: { select: ["invite_staff"], insert: ["invite_staff"], update: ["invite_staff"] },
    roles: { select: STAFF_MANAGEMENT_ROLES, insert: STAFF_MANAGEMENT_ROLES, update: STAFF_MANAGEMENT_ROLES },
  },
  role_permissions: {
    companyColumn: "company_id",
    permissions: { select: ["invite_staff"], insert: ["invite_staff"], delete: ["invite_staff"] },
    roles: { select: STAFF_MANAGEMENT_ROLES, insert: STAFF_MANAGEMENT_ROLES, delete: STAFF_MANAGEMENT_ROLES },
  },
  companies: {
    companyColumn: "id",
    roles: {
      select: STAFF_ROLES,
      update: STAFF_MANAGEMENT_ROLES,
      upsert: STAFF_MANAGEMENT_ROLES,
    },
  },
  outlets: {
    companyColumn: "company_id",
    roles: {
      select: STAFF_ROLES,
      insert: STAFF_MANAGEMENT_ROLES,
      update: STAFF_MANAGEMENT_ROLES,
      upsert: STAFF_MANAGEMENT_ROLES,
      delete: STAFF_MANAGEMENT_ROLES,
    },
  },
  menu_categories: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    permissions: { insert: ["manage_menu"], update: ["manage_menu"], upsert: ["manage_menu"], delete: ["manage_menu"] },
    roles: { select: STAFF_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES, delete: OPERATIONS_ROLES },
  },
  menu_items: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    permissions: { insert: ["manage_menu"], update: ["manage_menu"], upsert: ["manage_menu"], delete: ["manage_menu"] },
    roles: { select: STAFF_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES, delete: OPERATIONS_ROLES },
  },
  tables: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    permissions: { select: ["manage_orders"], insert: ["manage_menu"], update: ["manage_menu"], upsert: ["manage_menu"], delete: ["manage_menu"] },
    roles: { select: STAFF_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES, delete: OPERATIONS_ROLES },
  },
  inventory: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES, delete: OPERATIONS_ROLES },
  },
  inventory_aliases: {
    companyColumn: "company_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES },
  },
  inventory_batches: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES },
  },
  inventory_ledger: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES },
  },
  payment_modes: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: STAFF_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES },
  },
  printers: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, delete: OPERATIONS_ROLES },
  },
  kitchen_orders: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    permissions: { select: ["manage_orders"], insert: ["manage_orders"], update: ["manage_orders"], delete: ["manage_orders"] },
    roles: { select: STAFF_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, delete: OPERATIONS_ROLES },
  },
  orders: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    permissions: { select: ["manage_orders"], insert: ["manage_orders"], update: ["manage_orders"], upsert: ["manage_orders"] },
    roles: { select: STAFF_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES },
  },
  invoices: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    permissions: { select: ["manage_orders"], insert: ["manage_orders"], update: ["manage_orders"], upsert: ["manage_orders"] },
    roles: { select: STAFF_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES },
  },
  invoice_items: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    permissions: { select: ["manage_orders"], insert: ["manage_orders"], update: ["manage_orders"], upsert: ["manage_orders"] },
    roles: { select: STAFF_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES },
  },
  suppliers: {
    companyColumn: "company_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES },
  },
  procurement_orders: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES },
  },
  purchase_items: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, delete: OPERATIONS_ROLES },
  },
  purchase_invoices: {
    companyColumn: "company_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES },
  },
  ocr_invoice_results: {
    companyColumn: "company_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES },
  },
  recipes: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES, delete: OPERATIONS_ROLES },
  },
  ai_cache: {
    roles: { select: STAFF_MANAGEMENT_ROLES, insert: STAFF_MANAGEMENT_ROLES },
  },
  ai_logs: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { insert: OPERATIONS_ROLES, select: STAFF_MANAGEMENT_ROLES },
  },
  ai_execution_registry: {
    companyColumn: "company_id",
    roles: { select: STAFF_MANAGEMENT_ROLES, insert: STAFF_MANAGEMENT_ROLES, upsert: STAFF_MANAGEMENT_ROLES },
  },
  ai_governance_logs: {
    companyColumn: "company_id",
    roles: { insert: STAFF_MANAGEMENT_ROLES, select: STAFF_MANAGEMENT_ROLES },
  },
  ai_forecasts: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES },
  },
  ai_operational_actions: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { insert: OPERATIONS_ROLES, select: OPERATIONS_ROLES },
  },
  food_cost_alerts: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { insert: OPERATIONS_ROLES, select: OPERATIONS_ROLES },
  },
  restaurant_simulations: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { insert: OPERATIONS_ROLES, select: OPERATIONS_ROLES },
  },
  ai_recommendations: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: STAFF_MANAGEMENT_ROLES, insert: STAFF_MANAGEMENT_ROLES, update: STAFF_MANAGEMENT_ROLES, upsert: STAFF_MANAGEMENT_ROLES },
  },
  ai_insights: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: STAFF_MANAGEMENT_ROLES, insert: STAFF_MANAGEMENT_ROLES, update: STAFF_MANAGEMENT_ROLES, upsert: STAFF_MANAGEMENT_ROLES },
  },
  audit_logs: {
    companyColumn: "company_id",
    roles: { select: STAFF_MANAGEMENT_ROLES, insert: STAFF_MANAGEMENT_ROLES },
  },
  ai_providers: {
    companyColumn: "company_id",
    roles: { select: STAFF_MANAGEMENT_ROLES, insert: STAFF_MANAGEMENT_ROLES, update: STAFF_MANAGEMENT_ROLES, upsert: STAFF_MANAGEMENT_ROLES },
  },
  delivery_partner_prices: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES, upsert: OPERATIONS_ROLES, delete: OPERATIONS_ROLES },
  },
  delivery_orders: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES },
  },
  delivery_order_items: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES },
  },
  delivery_partners: {
    companyColumn: "company_id",
    roles: { select: OPERATIONS_ROLES },
  },
  outlet_delivery_partners: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES },
  },
  whatsapp_messages: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES },
  },
  alert_deliveries: {
    companyColumn: "company_id",
    roles: { select: OPERATIONS_ROLES, insert: OPERATIONS_ROLES, update: OPERATIONS_ROLES },
  },
  terminals: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: STAFF_ROLES, update: STAFF_MANAGEMENT_ROLES },
  },
  staff_sessions: {
    companyColumn: "company_id",
    outletColumn: "outlet_id",
    roles: { select: STAFF_MANAGEMENT_ROLES, insert: STAFF_ROLES, update: STAFF_MANAGEMENT_ROLES },
  },
  schema_migrations: {
    roles: { select: ["OWNER"], insert: ["OWNER"], upsert: ["OWNER"] },
  },
}

const RPC_RULES: Record<string, RpcRule> = {
  exec_sql: { roles: ["OWNER"] },
  get_top_selling_items: { roles: STAFF_ROLES, companyArg: "p_company_id", outletArgs: ["p_outlet_id"] },
  get_hsn_summary: { roles: STAFF_ROLES, companyArg: "p_company_id", outletArgs: ["p_outlet_id"] },
  update_kitchen_ticket_status: { permissions: ["manage_orders"], roles: OPERATIONS_ROLES, companyArg: "p_company_id", outletArgs: ["p_outlet_id"] },
  get_next_invoice_number: { permissions: ["manage_orders"], roles: STAFF_ROLES, outletArgs: ["p_outlet_id"] },
  settle_bill: { permissions: ["manage_orders"], roles: OPERATIONS_ROLES, companyArg: "p_company_id", outletArgs: ["p_outlet_id"] },
  edit_invoice: { permissions: ["manage_orders"], roles: OPERATIONS_ROLES, companyArg: "p_company_id", outletArgs: ["p_outlet_id"] },
  pos_terminal_handshake: { roles: STAFF_ROLES, companyArg: "p_company_id", outletArgs: ["p_outlet_id"] },
}

function hasAnyPermission(user: any, permissions?: string[]) {
  if (!permissions?.length) return false
  if (user?.is_owner || user?.permissions?.all) return true
  return permissions.some((permission) => Boolean(user?.permissions?.[permission]))
}

function hasAnyRole(user: any, roles?: string[]) {
  if (!roles?.length) return false
  if (user?.is_owner) return true
  return roles.includes(String(user?.role || "").toUpperCase())
}

function getRulePermissions(rule: TableRule | RpcRule, operation: Operation | "rpc") {
  const permissions = rule.permissions
  if (!permissions) return undefined
  if (Array.isArray(permissions)) return permissions
  if (operation === "rpc") return undefined
  return permissions[operation]
}

function getRuleRoles(rule: TableRule | RpcRule, operation: Operation | "rpc") {
  const roles = rule.roles
  if (!roles) return undefined
  if (Array.isArray(roles)) return roles
  if (operation === "rpc") return undefined
  return roles[operation]
}

function assertOperationAuthorization(user: any, rule: TableRule | RpcRule, operation: Operation | "rpc") {
  if (user?.is_owner) return
  if (hasAnyPermission(user, getRulePermissions(rule, operation))) return
  if (hasAnyRole(user, getRuleRoles(rule, operation))) return
  throw new Error(`Access denied for operation ${operation}`)
}

function normalizeFilters(filters: QueryFilter[] | undefined) {
  if (!Array.isArray(filters)) return []

  return filters.filter((filter): filter is QueryFilter => {
    if (!filter || typeof filter.column !== "string" || !filter.column.trim()) {
      return false
    }

    if (filter.operator === "in") {
      return Array.isArray(filter.value) && filter.value.some(isDefinedQueryValue)
    }

    if (filter.operator === "is") {
      return isDefinedQueryValue(filter.value)
    }

    return isDefinedQueryValue(filter.value)
  }).map((filter) => {
    if (filter.operator !== "in" || !Array.isArray(filter.value)) {
      return filter
    }

    return {
      ...filter,
      value: filter.value.filter(isDefinedQueryValue),
    }
  })
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function getAccessibleOutletIds(user: any) {
  if (user?.is_owner) {
    return null
  }

  return unique((user?.outlets || []).map((outlet: any) => outlet.id))
}

function isManagementUser(user: any) {
  return hasAnyRole(user, STAFF_MANAGEMENT_ROLES)
}

function extractFilterOutletIds(filters: QueryFilter[], outletColumn?: string) {
  if (!outletColumn) return []

  return unique(
    filters.flatMap((filter) => {
      if (filter.column !== outletColumn) return []
      if (filter.operator === "eq" || filter.operator === "is") {
        return [filter.value]
      }
      if (filter.operator === "in" && Array.isArray(filter.value)) {
        return filter.value
      }
      return []
    })
  )
}

function applyFilters(builder: any, filters: QueryFilter[]) {
  return filters.reduce((current, filter) => {
    switch (filter.operator) {
      case "eq":
        return current.eq(filter.column, filter.value)
      case "in":
        return current.in(filter.column, Array.isArray(filter.value) ? filter.value : [])
      case "gt":
        return current.gt(filter.column, filter.value)
      case "gte":
        return current.gte(filter.column, filter.value)
      case "lt":
        return current.lt(filter.column, filter.value)
      case "lte":
        return current.lte(filter.column, filter.value)
      case "ilike":
        return current.ilike(filter.column, filter.value)
      case "contains":
        return current.contains(filter.column, filter.value)
      case "is":
        return current.is(filter.column, filter.value)
      default:
        return current
    }
  }, builder)
}

async function assertOutletRowsAccessible(
  table: string,
  rule: TableRule,
  filters: QueryFilter[],
  user: any
) {
  if (!rule.outletColumn || user?.is_owner) return

  const allowedOutletIds = getAccessibleOutletIds(user) || []
  const explicitOutletIds = extractFilterOutletIds(filters, rule.outletColumn)

  if (explicitOutletIds.length) {
    const invalid = explicitOutletIds.filter((outletId) => !allowedOutletIds.includes(outletId))
    if (invalid.length) {
      throw new Error("Outlet access denied")
    }
    return
  }

  let probe = supabaseAdmin.from(table).select(rule.outletColumn)

  if (rule.companyColumn) {
    probe = probe.eq(rule.companyColumn, user.company_id)
  }

  probe = applyFilters(probe, filters)

  const { data, error } = await probe.limit(200)

  if (error) {
    throw new Error(error.message)
  }

  const disallowed = unique((data || []).map((row: any) => row[rule.outletColumn!])).filter(
    (outletId) => !allowedOutletIds.includes(outletId)
  )

  if (disallowed.length) {
    throw new Error("Outlet access denied")
  }
}

function normalizeRows(values: any) {
  return Array.isArray(values) ? values : [values]
}

function enforceScopedPayload(rows: any[], rule: TableRule, user: any) {
  const allowedOutletIds = getAccessibleOutletIds(user)

  return rows.map((row) => {
    const nextRow = { ...(row || {}) }

    if (rule.companyColumn) {
      nextRow[rule.companyColumn] = user.company_id
    }

    if (rule.outletColumn) {
      const outletId = nextRow[rule.outletColumn] || user.outlet_id || null
      if (!outletId) {
        throw new Error(`${rule.outletColumn} is required`)
      }

      if (allowedOutletIds && !allowedOutletIds.includes(outletId)) {
        throw new Error("Outlet access denied")
      }

      nextRow[rule.outletColumn] = outletId
    }

    return nextRow
  })
}

export async function executeDataQuery(user: any, payload: any) {
  const table = String(payload?.table || "")
  const operation = String(payload?.operation || "") as Operation
  const rule = TABLE_RULES[table]

  if (!rule) {
    throw new Error(`Table ${table} is not exposed through the central authority`)
  }

  if (!["select", "insert", "update", "upsert", "delete"].includes(operation)) {
    throw new Error(`Unsupported operation: ${operation}`)
  }

  assertOperationAuthorization(user, rule, operation)

  const filters = normalizeFilters(payload?.filters)
  const orders = Array.isArray(payload?.orderBy) ? payload.orderBy : []
  const resultMode = payload?.resultMode === "single" || payload?.resultMode === "maybeSingle"
    ? payload.resultMode
    : null

  if ((operation === "update" || operation === "delete") && rule.outletColumn) {
    await assertOutletRowsAccessible(table, rule, filters, user)
  }

  let builder: any

  if (operation === "select") {
    builder = supabaseAdmin
      .from(table)
      .select(payload?.select || "*", payload?.selectOptions || undefined)
  } else if (operation === "insert") {
    const rows = enforceScopedPayload(normalizeRows(payload?.values), rule, user)
    builder = supabaseAdmin.from(table).insert(Array.isArray(payload?.values) ? rows : rows[0], payload?.mutationOptions || undefined)
  } else if (operation === "update") {
    builder = supabaseAdmin.from(table).update(payload?.values || {}, payload?.mutationOptions || undefined)
  } else if (operation === "upsert") {
    const rows = enforceScopedPayload(normalizeRows(payload?.values), rule, user)
    builder = supabaseAdmin.from(table).upsert(Array.isArray(payload?.values) ? rows : rows[0], payload?.mutationOptions || undefined)
  } else {
    builder = supabaseAdmin.from(table).delete(payload?.mutationOptions || undefined)
  }

  if (rule.companyColumn) {
    builder = builder.eq(rule.companyColumn, user.company_id)
  }

  if (operation === "select" && !user?.is_owner) {
    const selfId = user?.profile_id || user?.user_id || user?.id || null

    if (!isManagementUser(user) && table === "profiles" && selfId) {
      builder = builder.eq("id", selfId)
    }

    if (!isManagementUser(user) && table === "outlet_users" && selfId) {
      builder = builder.eq("profile_id", selfId)
    }

    if (!isManagementUser(user) && table === "staff_sessions" && selfId) {
      builder = builder.eq("user_id", selfId)
    }
  }

  if (rule.outletColumn && operation === "select" && !user?.is_owner) {
    const allowedOutletIds = getAccessibleOutletIds(user) || []
    builder = builder.in(rule.outletColumn, allowedOutletIds)
  }

  builder = applyFilters(builder, filters)

  if (operation !== "select" && payload?.returningSelect) {
    builder = builder.select(
      payload.returningSelect,
      payload?.returningSelectOptions || undefined
    )
  }

  for (const order of orders as QueryOrder[]) {
    builder = builder.order(order.column, {
      ascending: order.ascending,
      nullsFirst: order.nullsFirst,
      foreignTable: order.foreignTable,
    })
  }

  if (typeof payload?.limit === "number") {
    builder = builder.limit(payload.limit)
  }

  if (resultMode === "single") {
    builder = builder.single()
  } else if (resultMode === "maybeSingle") {
    builder = builder.maybeSingle()
  }

  const { data, error, count } = await builder

  if (error) {
    return { data: null, error, count: count ?? null }
  }

  return { data, error: null, count: count ?? null }
}

export async function executeRpc(user: any, payload: any) {
  const fn = String(payload?.fn || "")
  const rule = RPC_RULES[fn]

  if (!rule) {
    throw new Error(`RPC ${fn} is not exposed through the central authority`)
  }

  assertOperationAuthorization(user, rule, "rpc")

  const args = { ...(payload?.args || {}) }

  if (rule.companyArg) {
    args[rule.companyArg] = user.company_id
  }

  for (const outletArg of rule.outletArgs || []) {
    const outletId = args[outletArg] || user.outlet_id || null

    if (!outletId) {
      throw new Error(`${outletArg} is required`)
    }

    const allowedOutletIds = getAccessibleOutletIds(user)
    if (allowedOutletIds && !allowedOutletIds.includes(outletId)) {
      throw new Error("Outlet access denied")
    }

    args[outletArg] = outletId
  }

  const { data, error } = await supabaseAdmin.rpc(fn, args)
  return { data, error: error || null }
}
