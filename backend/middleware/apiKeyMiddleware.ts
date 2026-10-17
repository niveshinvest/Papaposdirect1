import { supabaseAdmin } from "../lib/supabaseAdmin"
import crypto from 'crypto'

export async function apiKeyMiddleware(req: any, res: any, next: any) {
  try {
    const headerKey =
      req.headers["x-api-key"] ||
      (typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("ApiKey ")
        ? req.headers.authorization.split(" ")[1]
        : null)

    //if (!headerKey) return next()
    if (!headerKey) {
  return res.status(401).json({
    error: "API key missing"
  })
}

    // headerKey is the raw API key (pp_live_xxx). Compare via hash.
    const providedHash = crypto.createHash('sha256').update(headerKey).digest('hex')

    const { data: keyRow, error } = await supabaseAdmin
      .from("api_keys")
      .select('id, company_id, outlet_ids, permissions, is_active, rate_limit, rate_limit_window, key_mask')
      .eq("key_hash", providedHash)
      .maybeSingle()

    if (error || !keyRow) {
      return res.status(401).json({ error: "Invalid API key" })
    }

    // must be active
    if (!keyRow.is_active) {
      return res.status(401).json({ error: "API key inactive" })
    }

    if (!keyRow.company_id) {
      return res.status(403).json({ error: "Unauthorized outlet access" })
    }

    const outletIds = keyRow.outlet_ids || []
    if (!Array.isArray(outletIds) || outletIds.length === 0) {
      return res.status(403).json({ error: "Unauthorized outlet access" })
    }

    // Extract requested company/outlet from headers/query/body and enforce
    const requestedCompanyId =
      req.headers["x-company-id"] || req.headers["x-tenant-company-id"] || req.query?.company_id || req.body?.company_id
    const requestedOutletId =
      req.headers["x-outlet-id"] || req.headers["x-tenant-outlet-id"] || req.query?.outlet_id || req.body?.outlet_id

    if (requestedCompanyId && String(requestedCompanyId) !== String(keyRow.company_id)) {
      return res.status(403).json({ error: "Unauthorized outlet access" })
    }

    if (requestedOutletId && !outletIds.includes(requestedOutletId)) {
      return res.status(403).json({ error: "Unauthorized outlet access" })
    }

    // Normalize permissions into a map { perm: true }
    let perms: Record<string, boolean> = {}
    if (Array.isArray(keyRow.permissions)) {
      perms = keyRow.permissions.reduce<Record<string, boolean>>((acc: any, p: string) => {
        if (!p) return acc
        acc[String(p)] = true
        return acc
      }, {})
    } else if (keyRow.permissions && typeof keyRow.permissions === 'object') {
      perms = keyRow.permissions
    }

    // Attach canonical auth object required by enterprise rule
    req.auth = {
      company_id: keyRow.company_id,
      outlet_ids: outletIds,
      permissions: perms,
      api_key_id: keyRow.id,
      api_key_mask: keyRow.key_mask || null,
      rate_limit: keyRow.rate_limit || null,
      rate_limit_window: keyRow.rate_limit_window || 'day'
    }

    return next()
  } catch (err: any) {
    console.error("API Key auth error:", err?.message || err)
    return res.status(401).json({ error: "Invalid API key" })
  }
}

export default apiKeyMiddleware
