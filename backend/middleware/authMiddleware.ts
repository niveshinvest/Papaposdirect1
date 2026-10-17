import { supabaseAdmin } from "../lib/supabaseAdmin"
import { resolveAccess } from "../auth/accessResolver"
import jwt from 'jsonwebtoken'

export async function authMiddleware(req: any, res: any, next: any) {
  try {
    const auth = req.headers.authorization

    // If an Authorization Bearer token is present, prefer validating against Supabase
    if (auth?.startsWith("Bearer ")) {
      const token = auth.split(" ")[1]

      const {
        data: { user },
        error,
      } = await supabaseAdmin.auth.getUser(token)

      if (error || !user) {
        return res.status(401).json({ error: "Invalid token" })
      }

      // resolve access from profile/user id
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
      // Preserve the raw bearer token for downstream RPC calls so DB functions
      // using auth.uid() can observe the original user identity.
      req.bearer_token = token

      return next()
    }

    // Otherwise, attempt to accept an app session issued by the backend (WebAuthn exchange)
    const appTokenHeader = req.headers['x-app-session'] || null
    let appToken = appTokenHeader
    if (!appToken && typeof req.headers.cookie === 'string') {
      const cookies = req.headers.cookie.split(';').map((c: string) => c.trim())
      const match = cookies.find((c: string) => c.startsWith('papapos_session='))
      if (match) appToken = match.split('=')[1]
    }

    if (!appToken) return res.status(401).json({ error: 'No token found' })

    const secret = process.env.WEBAUTHN_EXCHANGE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-secret'
    let payload: any = null
    try {
      payload = jwt.verify(appToken, secret) as any
    } catch (e) {
      return res.status(401).json({ error: 'Invalid app session token' })
    }

    // payload should contain profile_id
    const profileId = payload?.profile_id
    if (!profileId) return res.status(401).json({ error: 'Invalid app session payload' })

    // Load minimal profile row and resolve access
    const { data: profile, error: profErr } = await supabaseAdmin.from('profiles').select('*').eq('id', profileId).maybeSingle()
    if (profErr || !profile) return res.status(401).json({ error: 'Profile not found' })

    const requestedCompanyId =
      req.headers["x-company-id"] ||
      req.headers["x-tenant-company-id"] ||
      req.query.company_id

    const requestedOutletId =
      req.headers["x-outlet-id"] ||
      req.headers["x-tenant-outlet-id"] ||
      req.query.outlet_id

    const access = await resolveAccess(profileId, {
      companyId: typeof requestedCompanyId === "string" ? requestedCompanyId : null,
      outletId: typeof requestedOutletId === "string" ? requestedOutletId : null,
    })

    req.user = access
    req.profile_id = access.profile_id
    req.company_id = access.company_id
    req.outlet_id = access.outlet_id
    req.role = access.role
    // We do not have a Supabase bearer token in this flow.
    req.bearer_token = null

    return next()
  } catch (err: any) {
    console.error("Auth error:", err.message)
    res.status(401).json({ error: err.message })
  }
}
