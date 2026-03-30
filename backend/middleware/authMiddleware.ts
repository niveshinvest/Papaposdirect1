import { supabaseAdmin } from "../lib/supabaseAdmin"
import { resolveAccess } from "../auth/accessResolver"

export async function authMiddleware(req: any, res: any, next: any) {
  try {
    const auth = req.headers.authorization

    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token found" })
    }

    const token = auth.split(" ")[1]

    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" })
    }

    const requestedCompanyId =
      req.headers["x-company-id"] ||
      req.headers["x-tenant-company-id"] ||
      req.query.company_id

    const requestedOutletId =
      req.headers["x-outlet-id"] ||
      req.headers["x-tenant-outlet-id"] ||
      req.query.outlet_id

    const access = await resolveAccess(user.id, {
      companyId:
        typeof requestedCompanyId === "string" ? requestedCompanyId : null,
      outletId: typeof requestedOutletId === "string" ? requestedOutletId : null,
    })

    req.user = access
    req.profile_id = access.profile_id
    req.company_id = access.company_id
    req.outlet_id = access.outlet_id
    req.role = access.role

    next()
  } catch (err: any) {
    console.error("Auth error:", err.message)
    res.status(401).json({ error: err.message })
  }
}
