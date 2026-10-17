import { supabaseAdmin } from "./supabaseAdmin"

type Auth = {
  company_id: string
  outlet_ids: string[]
}

function assertAuth(auth?: Auth) {
  if (
    !auth ||
    !auth.company_id ||
    !Array.isArray(auth.outlet_ids) ||
    auth.outlet_ids.length === 0
  ) {
    throw new Error("Missing auth.company_id or auth.outlet_ids")
  }
}

/**
 * Secure query helper for selects
 * Enforces company_id + proper outlet filtering
 */
export function secureFrom(
  table: string,
  auth: Auth,
  select = "*"
) {
  assertAuth(auth)

  let query = supabaseAdmin
    .from(table)
    .select(select)
    .eq("company_id", auth.company_id)

  /**
   * api_keys uses outlet_ids (array)
   * most other tables use outlet_id (single value)
   */
  if (table === "api_keys") {
    query = query.overlaps("outlet_ids", auth.outlet_ids)
  } else {
    query = query.in("outlet_id", auth.outlet_ids)
  }

  return query
}

/**
 * Secure operations for mutations
 */
export function secureOp(table: string, auth: Auth) {
  assertAuth(auth)

  return {
    select: (sel = "*") => secureFrom(table, auth, sel),

    insert: (values: any) => {
      const rows = Array.isArray(values) ? values : [values]

      const transformed = rows.map((row: any) => ({
        ...row,
        company_id: auth.company_id
      }))

      return supabaseAdmin
        .from(table)
        .insert(transformed)
        .select()
    },

    upsert: (values: any, opts?: any) => {
      const rows = Array.isArray(values) ? values : [values]

      const transformed = rows.map((row: any) => ({
        ...row,
        company_id: auth.company_id
      }))

      return supabaseAdmin
        .from(table)
        .upsert(transformed, opts)
        .select()
    },

    update: (values: any) => {
      return supabaseAdmin
        .from(table)
        .update(values)
    },

    delete: () => {
      return supabaseAdmin
        .from(table)
        .delete()
    }
  }
}

export default secureFrom