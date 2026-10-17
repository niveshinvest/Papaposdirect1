import "dotenv/config"
import express from "express"
import cors from "cors"
import { randomUUID } from "crypto"
import { authMiddleware } from "./middleware/authMiddleware"
import apiKeyMiddleware from "./middleware/apiKeyMiddleware"
import {
  requireCompanyAccess,
  requireOutletAccess,
  requirePermission,
} from "./middleware/permissionMiddleware"
import { executeDataQuery, executeRpc } from "./data/dataGateway"
import { supabaseAdmin } from "./lib/supabaseAdmin"
import adminRoutes from "./routes/admin"
import webauthnRoutes from "./routes/webauthn"
import printAgentRoutes from "./routes/printAgent"
import apiKeysRoutes from './routes/apiKeys'
import rateLimitMiddleware from './middleware/rateLimitMiddleware'
import rateLimiterV2 from './middleware/rateLimiterV2'
//import { initRateLimiter } from './lib/rateLimiter'
import requestLogger from './middleware/requestLogger'
import publicApiRoutes from './routes/public-api'
import webhooksRoutes from './routes/webhooks'
import { startRetryEngine } from './jobs/retry-engine'
import { startEventProcessor } from './jobs/event-processor'
import eventBus from './services/eventBus'
import { deliverWebhook } from './services/webhookDelivery'
console.log("SERVER FILE LOADED !!!")
const app = express()
console.log("SERVER FILE LOADED !!!")

app.use((req, res, next) => {
  console.log("HEADERS:", req.headers)
  next()
})

app.use((req, res, next) => {
  console.log("Incoming:", req.method, req.url)
  next()
})

// ✅ ADD THIS HERE
app.use(cors({
  origin: [
    "https://papaposdirect.pages.dev",
    "https://papapos.pages.dev",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://192.168.1.106:3000"

  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-company-id",
    "x-outlet-id",
    "priority",
     "x-api-key",
    "*"
  ],
  credentials: true
}))

app.options('*', cors())

app.use(express.json())

app.use("/print-agent", printAgentRoutes)


const api = express.Router()
// Public setup route: allow new users to create a company without requiring
// the general `authMiddleware` which expects the user to already be mapped
// to a company. This route will validate the Bearer token itself.
app.post("/api/setup/company", async (req, res) => {
  console.log("Setup company request received with body:", req.body, "and headers:", req.headers)
  try {
    const auth = req.headers.authorization

    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token found" })
    }

    const token = auth.split(" ")[1]
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token)
    console.log("User from token:", user, "Error:", userError)

    if (userError || !user) {
      return res.status(401).json({ error: "Invalid token" })
    }

    const name = String(req.body?.name || "").trim()
    if (!name) {
      return res.status(400).json({ error: "Company name is required" })
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({ name, owner_id: user.id })
      .select("*")
      .single()

    if (companyError) throw companyError

    const defaultOutletId = `main-${String(company.id).slice(0, 8)}`

    const { error: companyUserError } = await supabaseAdmin.from("company_users").insert({
      profile_id: user.id,
      company_id: company.id,
      role: "OWNER",
      permissions: { all: true },
    })

    if (companyUserError) throw companyUserError

    const { error: ownerError } = await supabaseAdmin
      .from("owners")
      .upsert({ profile_id: user.id, company_id: company.id }, { onConflict: "profile_id" })

    if (ownerError) throw ownerError

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: user.id,
        company_id: company.id,
        full_name: user.user_metadata?.full_name || null,
        role: "OWNER",
        is_active: true,
      },
      { onConflict: "id" }
    )

    if (profileError) throw profileError

    const { error: outletError } = await supabaseAdmin.from("outlets").insert({
      id: defaultOutletId,
      company_id: company.id,
      name: "Main Outlet",
    })

    if (outletError) throw outletError

    const { error: outletUserError } = await supabaseAdmin.from("outlet_users").insert({
      profile_id: user.id,
      outlet_id: defaultOutletId,
      role: "OWNER",
      permissions: { all: true },
    })

    if (outletUserError) throw outletUserError

    res.json({
      company,
      default_outlet: {
        id: defaultOutletId,
        company_id: company.id,
        name: "Main Outlet",
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// Initialize rate limiter (requires REDIS_URL)
try {
  //initRateLimiter()
} catch (e:any) {
  console.error('Rate limiter initialization failed:', e.message)
  // For production-grade enforcement we fail fast
  throw e
}

// request logger should run after apiKeyMiddleware so we have api_key_id
// New production-grade limiter runs after request logging and before auth
//app.use("/api", apiKeyMiddleware, requestLogger(), rateLimiterV2(), rateLimitMiddleware(), authMiddleware, api)
app.use(
  "/api",
  requestLogger(),
  authMiddleware,
  api
)
app.use(
  "/connect",
  apiKeyMiddleware,
  rateLimiterV2(),
  
);

// Mount external public API namespace (additive only)
app.use(
  '/public-api',
  cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type','x-api-key','x-company-id','x-outlet-id','authorization'] }),
  apiKeyMiddleware,
  rateLimiterV2(),
  publicApiRoutes
)

// Webhook admin API (protected)
app.use('/webhooks', authMiddleware, webhooksRoutes)


// Mount WebAuthn public routes
app.use('/webauthn', webauthnRoutes)
api.use(requireCompanyAccess())

// app.use("/api/admin", adminRoutes)





const PORT = Number(process.env.PORT) || 10000

function normalizeRole(role: unknown) {
  return String(role || "").toUpperCase()
}

function permissionMapFromKeys(keys: string[]) {
  return keys.reduce<Record<string, boolean>>((acc, key) => {
    if (!key) return acc
    acc[key] = true
    if (key === "all") {
      acc.all = true
    }
    return acc
  }, {})
}

async function resolveRoleRow(companyId: string, role: string) {
  const normalizedRole = normalizeRole(role)
  const { data, error } = await supabaseAdmin
    .from("roles")
    .select("id, role")
    .eq("company_id", companyId)
    .eq("role", normalizedRole)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to resolve role row: ${error.message}`)
  }

  return data
}

async function fetchRolePermissionMap(companyId: string, role: string) {
  if (normalizeRole(role) === "OWNER") {
    const { data: allPermissions, error: permissionError } = await supabaseAdmin
      .from("permissions")
      .select("key")
      .eq("is_active", true)

    if (permissionError) {
      throw new Error(`Failed to fetch owner permissions: ${permissionError.message}`)
    }

    const keys = (allPermissions || [])
      .map((row: any) => row.key)
      .filter((key: string | null | undefined): key is string => Boolean(key))

    return {
      all: true,
      ...permissionMapFromKeys(keys),
    }
  }

  const roleRow = await resolveRoleRow(companyId, role)

  if (!roleRow?.id) {
    return {}
  }

  const { data, error } = await supabaseAdmin
    .from("role_permissions")
    .select("permission:permissions(key)")
    .eq("company_id", companyId)
    .eq("role_id", roleRow.id)

  if (error) {
    throw new Error(`Failed to fetch role permissions: ${error.message}`)
  }

  const keys = (data || [])
    .map((row: any) => row.permission?.key)
    .filter((key: string | null | undefined): key is string => Boolean(key))

  return permissionMapFromKeys(keys)
}

async function isProtectedOwner(companyId: string, profileId: string) {
  const { data, error } = await supabaseAdmin
    .from("owners")
    .select("profile_id")
    .eq("company_id", companyId)
    .eq("profile_id", profileId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to resolve owner protection: ${error.message}`)
  }

  return Boolean(data)
}

async function upsertProfileInvite(params: {
  companyId: string
  profileId: string
  email: string
  fullName?: string | null
  role: string
  outletIds: string[]
  createdBy?: string | null
}) {
  const inviteToken = randomUUID()
  const { data, error } = await supabaseAdmin
    .from("profile_invites")
    .upsert(
      {
        company_id: params.companyId,
        profile_id: params.profileId,
        email: params.email,
        full_name: params.fullName || null,
        role: params.role,
        outlet_ids: params.outletIds,
        invite_token: inviteToken,
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        created_by: params.createdBy || null,
      },
      {
        onConflict: "company_id,email",
      }
    )
    .select("id, invite_token, email, profile_id")
    .single()

  if (error) {
    throw new Error(`Failed to persist profile invite: ${error.message}`)
  }

  return data
}



app.use("/api/admin", authMiddleware, requireCompanyAccess(), adminRoutes)
app.use("/api/settings/api-keys", authMiddleware, requireCompanyAccess(), requirePermission('manage_api_keys'), apiKeysRoutes)

app.get("/health", (_, res) => res.send("OK"))

app.post("/api/setup/company", async (req, res) => {
  console.log("Setup company request received with body inside server.ts:", req.body, "and headers:", req.headers)
  try {
    const auth = req.headers.authorization

    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token found" })
    }

    const token = auth.split(" ")[1]
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token)
console.log("User from token:", user, "Error:", userError)

    if (userError || !user) {
      return res.status(401).json({ error: "Invalid token" })
    }

    const name = String(req.body?.name || "").trim()
    if (!name) {
      return res.status(400).json({ error: "Company name is required" })
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({ name, owner_id: user.id })
      .select("*")
      .single()

    if (companyError) throw companyError

    const defaultOutletId = `main-${String(company.id).slice(0, 8)}`

    const { error: companyUserError } = await supabaseAdmin.from("company_users").insert({
      profile_id: user.id,
      company_id: company.id,
      role: "OWNER",
      permissions: { all: true },
    })

    if (companyUserError) throw companyUserError

    const { error: ownerError } = await supabaseAdmin
      .from("owners")
      .upsert({ profile_id: user.id, company_id: company.id }, { onConflict: "profile_id" })

    if (ownerError) throw ownerError

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: user.id,
        company_id: company.id,
        full_name: user.user_metadata?.full_name || null,
        role: "OWNER",
        is_active: true,
      },
      { onConflict: "id" }
    )

    if (profileError) throw profileError

    const { error: outletError } = await supabaseAdmin.from("outlets").insert({
      id: defaultOutletId,
      company_id: company.id,
      name: "Main Outlet",
    })

    if (outletError) throw outletError

    const { error: outletUserError } = await supabaseAdmin.from("outlet_users").insert({
      profile_id: user.id,
      outlet_id: defaultOutletId,
      role: "OWNER",
      permissions: { all: true },
    })

    if (outletUserError) throw outletUserError

    res.json({
      company,
      default_outlet: {
        id: defaultOutletId,
        company_id: company.id,
        name: "Main Outlet",
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

app.post("/auth/validate-device", async (req, res) => {
  const { device_fingerprint, profile_id, staff_id } = req.body
  const resolvedProfileId = profile_id || staff_id

  if (!device_fingerprint || !resolvedProfileId) {
    return res.status(400).json({ error: "Missing fields" })
  }

  return res.json({ success: true })
})

app.get("/auth/verify-invite/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "")
    if (!token) {
      return res.status(400).json({ error: "Invite token is required" })
    }

    const { data, error } = await supabaseAdmin
      .from("profile_invites")
      .select("id, company_id, profile_id, email, full_name, role, outlet_ids, expires_at, accepted_at")
      .eq("invite_token", token)
      .gt("expires_at", new Date().toISOString())
      .is("accepted_at", null)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      return res.status(404).json({ error: "Invalid or expired invite token" })
    }

    res.json(data)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

app.post("/auth/complete-onboarding", async (req, res) => {
  const { token, password, full_name } = req.body

  if (!token || !password) {
    return res.status(400).json({ error: "token and password are required" })
  }

  try {
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("profile_invites")
      .select("id, company_id, profile_id, email, full_name, role, outlet_ids, expires_at, accepted_at")
      .eq("invite_token", token)
      .gt("expires_at", new Date().toISOString())
      .is("accepted_at", null)
      .maybeSingle()

    if (inviteError) throw inviteError
    if (!invite?.profile_id) {
      return res.status(404).json({ error: "Invalid or expired invite token" })
    }

    const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(
      invite.profile_id,
      {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name || invite.full_name || null,
        },
      }
    )

    if (updateUserError) throw updateUserError

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: full_name || invite.full_name || null,
        company_id: invite.company_id,
        role: normalizeRole(invite.role),
        is_active: true,
      })
      .eq("id", invite.profile_id)

    if (profileError) throw profileError

    const { error: inviteAcceptError } = await supabaseAdmin
      .from("profile_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id)

    if (inviteAcceptError) throw inviteAcceptError

    res.json({
      success: true,
      profile_id: invite.profile_id,
      company_id: invite.company_id,
      role: normalizeRole(invite.role),
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})



app.get("/api/tenant/companies", authMiddleware, async (req: any, res) => {
  try {
    const memberships = req.user?.companies || []
    const companyIds = memberships.map((company: any) => company.id)

    const { data: companies, error } = companyIds.length
      ? await supabaseAdmin.from("companies").select("*").in("id", companyIds)
      : { data: [], error: null as any }

    if (error) throw error

    const companyMap = new Map((companies || []).map((company: any) => [company.id, company]))
    res.json(
      memberships.map((membership: any) => ({
        ...membership,
        companies: companyMap.get(membership.id) || null,
      }))
    )
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

api.get("/test", (req: any, res) => {
  res.json({
    message: "Protected working",
    user: req.user,
  })
})

api.get("/access", (req: any, res) => {
  res.json(req.user)
})

api.post("/data/query", async (req: any, res) => {
  try {
    const result = await executeDataQuery(req.user, req.body)
    res.json(result)
  } catch (error: any) {
    res.status(400).json({ data: null, error: { message: error.message } })
  }
})

api.post("/data/rpc", async (req: any, res) => {
  try {
    const bearer = req.bearer_token || req.headers.authorization || null
    const result = await executeRpc(req.user, req.body, bearer)
    res.json(result)
  } catch (error: any) {
    res.status(400).json({ data: null, error: { message: error.message } })
  }
})

api.post(
  "/admin/invite-staff",
  requirePermission("invite_staff"),
  async (req, res) => {
    try {
      const { email, full_name, role, outlet_ids } = req.body
      const companyId = req.user.company_id
      const normalizedRole = normalizeRole(role)

      if (!email || !normalizedRole) {
        return res.status(400).json({ error: "email and role are required" })
      }

      const { data: usersPage, error: listUsersError } =
        await supabaseAdmin.auth.admin.listUsers()

      if (listUsersError) throw listUsersError

      const existingUser = usersPage.users.find(
        (user: any) => user.email?.toLowerCase() === String(email).toLowerCase()
      )

      let profileId = existingUser?.id

      if (!profileId) {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: full_name || null,
          },
        })

        if (error) throw error
        profileId = data.user.id
      }

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
        {
          id: profileId,
          company_id: companyId,
          full_name: full_name || null,
          role: normalizedRole,
          is_active: true,
        },
        { onConflict: "id" }
      )

      if (profileError) throw profileError

      const { error: companyUserError } = await supabaseAdmin
        .from("company_users")
        .upsert({
          profile_id: profileId,
          company_id: companyId,
          role: normalizedRole,
        })

      if (companyUserError) throw companyUserError

      const { data: companyOutlets, error: companyOutletsError } = await supabaseAdmin
        .from("outlets")
        .select("id")
        .eq("company_id", companyId)

      if (companyOutletsError) throw companyOutletsError

      const companyOutletIds = (companyOutlets || []).map((outlet: any) => outlet.id)

      if (companyOutletIds.length) {
        const { error: deleteOutletAccessError } = await supabaseAdmin
          .from("outlet_users")
          .delete()
          .eq("profile_id", profileId)
          .in("outlet_id", companyOutletIds)

        if (deleteOutletAccessError) throw deleteOutletAccessError
      }

      if (Array.isArray(outlet_ids) && outlet_ids.length) {
        const rows = outlet_ids.map((outlet_id: string) => ({
          profile_id: profileId,
          outlet_id,
          role: normalizedRole,
        }))

        const { error: outletUserError } = await supabaseAdmin
          .from("outlet_users")
          .upsert(rows)

        if (outletUserError) throw outletUserError
      }

      const invite = await upsertProfileInvite({
        companyId,
        profileId,
        email: String(email).toLowerCase(),
        fullName: full_name || null,
        role: normalizedRole,
        outletIds: Array.isArray(outlet_ids) ? outlet_ids : [],
        createdBy: req.user.profile_id || null,
      })

      res.json({
        success: true,
        profile_id: profileId,
        invite_token: invite.invite_token,
      })
    } catch (err: any) {
      res.status(400).json({
        error: err.message,
      })
    }
  }
)

api.post(
  "/admin/profile-invites/resend",
  requirePermission("invite_staff"),
  async (req, res) => {
    try {
      const companyId = req.user.company_id
      const profileId = req.body?.profile_id ? String(req.body.profile_id) : null
      const email = req.body?.email ? String(req.body.email).toLowerCase() : null

      let query = supabaseAdmin
        .from("profile_invites")
        .select("profile_id, email, full_name, role, outlet_ids")
        .eq("company_id", companyId)

      if (profileId) {
        query = query.eq("profile_id", profileId)
      } else if (email) {
        query = query.eq("email", email)
      } else {
        return res.status(400).json({ error: "profile_id or email is required" })
      }

      const { data: invite, error } = await query.maybeSingle()

      if (error) throw error
      if (!invite?.profile_id) {
        return res.status(404).json({ error: "Invite not found" })
      }

      const refreshedInvite = await upsertProfileInvite({
        companyId,
        profileId: invite.profile_id,
        email: invite.email,
        fullName: invite.full_name,
        role: normalizeRole(invite.role),
        outletIds: invite.outlet_ids || [],
        createdBy: req.user.profile_id || null,
      })

      res.json({
        success: true,
        profile_id: refreshedInvite.profile_id,
        invite_token: refreshedInvite.invite_token,
      })
    } catch (error: any) {
      res.status(400).json({ error: error.message })
    }
  }
)

api.get("/admin/permissions", requirePermission("invite_staff"), async (_, res) => {
  const { data, error } = await supabaseAdmin
    .from("permissions")
    .select("*")
    .eq("is_active", true)
    .order("module")

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  res.json(data)
})

api.get("/admin/staff", requirePermission("invite_staff"), async (req, res) => {
  try {
    const companyId = req.user.company_id

    const { data: companyUsers, error: companyUserError } = await supabaseAdmin
      .from("company_users")
      .select("id, profile_id, company_id, role, permissions, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })

    if (companyUserError) throw companyUserError

    const profileIds = (companyUsers || []).map((row: any) => row.profile_id)

    const { data: profiles, error: profileError } = profileIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name, is_active")
          .in("id", profileIds)
      : { data: [], error: null as any }

    if (profileError) throw profileError

    const { data: outletUsers, error: outletError } = profileIds.length
      ? await supabaseAdmin
          .from("outlet_users")
          .select("profile_id, outlet_id, role, permissions")
          .in("profile_id", profileIds)
      : { data: [], error: null as any }

    if (outletError) throw outletError

    const { data: outlets, error: outletsError } = await supabaseAdmin
      .from("outlets")
      .select("id, name")
      .eq("company_id", companyId)

    if (outletsError) throw outletsError

    const { data: invites, error: invitesError } = await supabaseAdmin
      .from("profile_invites")
      .select("profile_id, email, accepted_at, invite_token, expires_at")
      .eq("company_id", companyId)

    if (invitesError) throw invitesError

    const profileMap = new Map(
      (profiles || []).map((profile: any) => [profile.id, profile])
    )
    const outletNameMap = new Map(
      (outlets || []).map((outlet: any) => [outlet.id, outlet.name])
    )
    const inviteMap = new Map(
      (invites || []).map((invite: any) => [invite.profile_id, invite])
    )
    const outletUsersByProfile = (outletUsers || []).reduce(
      (acc: Record<string, any[]>, row: any) => {
        acc[row.profile_id] = acc[row.profile_id] || []
        acc[row.profile_id].push(row)
        return acc
      },
      {}
    )

    const response = (companyUsers || []).map((membership: any) => {
      const profile = profileMap.get(membership.profile_id)
      const invite = inviteMap.get(membership.profile_id)
      const outletsForProfile = (outletUsersByProfile[membership.profile_id] || []).map(
        (outletMembership: any) => ({
          id: outletMembership.outlet_id,
          name:
            outletNameMap.get(outletMembership.outlet_id) || outletMembership.outlet_id,
          role: outletMembership.role,
          permissions: outletMembership.permissions || {},
        })
      )

      return {
        id: membership.id,
        profile_id: membership.profile_id,
        company_id: membership.company_id,
        role: membership.role,
        permissions: membership.permissions || {},
        name: profile?.full_name || null,
        email: invite?.email || null,
        is_active: profile?.is_active ?? true,
        invite_token: invite?.invite_token || null,
        invite_expires_at: invite?.expires_at || null,
        invite_accepted_at: invite?.accepted_at || null,
        outlets: outletsForProfile,
        outlet_ids: outletsForProfile.map((outlet: any) => outlet.id),
      }
    })

    res.json(response)
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    })
  }
})

api.patch(
  "/admin/staff/:profileId/role",
  requirePermission("invite_staff"),
  async (req, res) => {
  const companyId = req.user.company_id
  const profileId = String(req.params.profileId)
  const normalizedRole = normalizeRole(req.body?.role)

  if (!normalizedRole) {
    return res.status(400).json({ error: "role is required" })
  }

  try {
    if (await isProtectedOwner(companyId, profileId)) {
      return res.status(409).json({
        error: "Protected owner role cannot be changed through membership editing.",
      })
    }

    const { error: companyUserError } = await supabaseAdmin
      .from("company_users")
      .update({ role: normalizedRole })
      .eq("company_id", companyId)
      .eq("profile_id", profileId)

    if (companyUserError) throw companyUserError

    const { data: outletRows, error: outletLookupError } = await supabaseAdmin
      .from("outlets")
      .select("id")
      .eq("company_id", companyId)

    if (outletLookupError) throw outletLookupError

    const companyOutletIds = (outletRows || []).map((row: any) => row.id)

    if (companyOutletIds.length) {
      const { error: outletUserError } = await supabaseAdmin
        .from("outlet_users")
        .update({ role: normalizedRole })
        .eq("profile_id", profileId)
        .in("outlet_id", companyOutletIds)

      if (outletUserError) throw outletUserError
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ role: normalizedRole })
      .eq("id", profileId)

    if (profileError) throw profileError

    const { error: inviteError } = await supabaseAdmin
      .from("profile_invites")
      .update({ role: normalizedRole })
      .eq("company_id", companyId)
      .eq("profile_id", profileId)

    if (inviteError) throw inviteError

    res.json({ success: true })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

api.patch(
  "/admin/staff/:profileId/outlets",
  requirePermission("invite_staff"),
  async (req, res) => {
  const companyId = req.user.company_id
  const profileId = String(req.params.profileId)
  const outletIds = Array.isArray(req.body?.outlet_ids) ? req.body.outlet_ids : []

  try {
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("company_users")
      .select("role")
      .eq("company_id", companyId)
      .eq("profile_id", profileId)
      .maybeSingle()

    if (membershipError) throw membershipError
    if (!membership) {
      return res.status(404).json({ error: "Company membership not found" })
    }

    const { data: outletRows, error: outletLookupError } = await supabaseAdmin
      .from("outlets")
      .select("id")
      .eq("company_id", companyId)

    if (outletLookupError) throw outletLookupError

    const companyOutletIds = (outletRows || []).map((row: any) => row.id)

    if (companyOutletIds.length) {
      const { error: deleteError } = await supabaseAdmin
        .from("outlet_users")
        .delete()
        .eq("profile_id", profileId)
        .in("outlet_id", companyOutletIds)

      if (deleteError) throw deleteError
    }

    if (outletIds.length) {
      const rows = outletIds.map((outletId: string) => ({
        profile_id: profileId,
        outlet_id: outletId,
        role: membership.role,
      }))

      const { error: insertError } = await supabaseAdmin
        .from("outlet_users")
        .insert(rows)

      if (insertError) throw insertError
    }

    const { error: inviteError } = await supabaseAdmin
      .from("profile_invites")
      .update({ outlet_ids: outletIds })
      .eq("company_id", companyId)
      .eq("profile_id", profileId)

    if (inviteError) throw inviteError

    res.json({ success: true })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

api.patch(
  "/admin/staff/:profileId/status",
  requirePermission("invite_staff"),
  async (req, res) => {
  const companyId = req.user.company_id
  const profileId = String(req.params.profileId)
  const isActive = Boolean(req.body?.is_active)

  try {
    if (await isProtectedOwner(companyId, profileId)) {
      return res.status(409).json({
        error: "Protected owner cannot be disabled through membership editing.",
      })
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: isActive })
      .eq("id", profileId)

    if (error) throw error

    res.json({ success: true })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

api.get(
  "/orders",
  requirePermission("manage_orders"),
  requireOutletAccess(),
  (req: any, res) => {
    res.json({
      orders: [],
      user: req.user,
    })
  }
)

api.get("/discounts/active", requireOutletAccess(), async (req: any, res) => {
  const outletId = String(req.query?.outlet_id || req.user?.outlet_id || req.headers["x-outlet-id"] || "")
  const companyId = req.user?.company_id

  if (!companyId || !outletId) {
    return res.status(400).json({ error: "company_id and outlet_id are required" })
  }

  try {
    const [{ data: discounts, error: discountsError }, { data: settings, error: settingsError }] = await Promise.all([
      supabaseAdmin
        .from("discounts")
        .select("*")
        .eq("company_id", companyId)
        .eq("outlet_id", outletId)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("discount_settings")
        .select("*")
        .eq("company_id", companyId)
        .eq("outlet_id", outletId)
        .maybeSingle(),
    ])

    if (discountsError) throw discountsError
    if (settingsError && settingsError.code !== "PGRST116") throw settingsError

    res.json({
      discounts: discounts || [],
      config: settings || {
        max_manual_discount_percent: 20,
        allowed_manual_discount_types: ["FLAT", "PERCENTAGE"],
        allow_cashier_manual_discount: false,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

api.get("/offers/active", requireOutletAccess(), async (req: any, res) => {
  const outletId = String(req.query?.outlet_id || req.user?.outlet_id || req.headers["x-outlet-id"] || "")
  const companyId = req.user?.company_id

  if (!companyId || !outletId) {
    return res.status(400).json({ error: "company_id and outlet_id are required" })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("offers")
      .select("*, offer_conditions(*), offer_rewards(*)")
      .eq("company_id", companyId)
      .eq("outlet_id", outletId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (error) throw error

    const offers = (data || []).map((offer: any) => ({
      ...offer,
      conditions: offer.offer_conditions?.[0] || null,
      rewards: offer.offer_rewards?.[0] || null,
    }))

    res.json({ offers })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

api.get("/combos", requireOutletAccess(), async (req: any, res) => {
  const outletId = String(req.query?.outlet_id || req.user?.outlet_id || req.headers["x-outlet-id"] || "")
  const companyId = req.user?.company_id

  if (!companyId || !outletId) {
    return res.status(400).json({ error: "company_id and outlet_id are required" })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("combos")
      .select("*, combo_items(*)")
      .eq("company_id", companyId)
      .eq("outlet_id", outletId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (error) throw error

    const combos = (data || []).map((combo: any) => ({
      ...combo,
      groups: combo.combo_items || [],
    }))

    res.json({ combos })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

api.post("/apply-discount", requireOutletAccess(), async (req: any, res) => {
  const { discount_id, draft } = req.body || {}
  if (!discount_id && !draft) {
    return res.status(400).json({ error: "discount_id or draft is required" })
  }

  try {
    if (draft) {
      return res.json({ applied: true, mode: "manual", draft })
    }

    const { data, error } = await supabaseAdmin
      .from("discounts")
      .select("*")
      .eq("company_id", req.user.company_id)
      .eq("id", discount_id)
      .eq("is_active", true)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return res.status(404).json({ error: "Discount not found" })
    }

    res.json({ applied: true, discount: data })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

api.post("/apply-offer", requireOutletAccess(), async (req: any, res) => {
  const { offer_id } = req.body || {}
  if (!offer_id) {
    return res.status(400).json({ error: "offer_id is required" })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("offers")
      .select("*, offer_conditions(*), offer_rewards(*)")
      .eq("company_id", req.user.company_id)
      .eq("id", offer_id)
      .eq("is_active", true)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return res.status(404).json({ error: "Offer not found" })
    }

    res.json({
      applied: true,
      offer: {
        ...data,
        conditions: data.offer_conditions?.[0] || null,
        rewards: data.offer_rewards?.[0] || null,
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

api.post("/apply-combo", requireOutletAccess(), async (req: any, res) => {
  const { combo_id } = req.body || {}
  if (!combo_id) {
    return res.status(400).json({ error: "combo_id is required" })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("combos")
      .select("*, combo_items(*)")
      .eq("company_id", req.user.company_id)
      .eq("id", combo_id)
      .eq("is_active", true)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return res.status(404).json({ error: "Combo not found" })
    }

    res.json({
      applied: true,
      combo: {
        ...data,
        groups: data.combo_items || [],
      },
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

api.get(
  "/admin/role-permissions",
  requirePermission("invite_staff"),
  async (req, res) => {
  const { role } = req.query
  const companyId = req.user.company_id

  if (typeof role !== "string" || !role) {
    return res.status(400).json({ error: "role is required" })
  }

  try {
    const data = await fetchRolePermissionMap(companyId, role)
    res.json(data)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

api.post(
  "/admin/role-permissions",
  requirePermission("invite_staff"),
  async (req, res) => {
  const { role, permissions } = req.body
  const companyId = req.user.company_id
  const normalizedRole = normalizeRole(role)

  if (!normalizedRole || typeof permissions !== "object" || permissions === null) {
    return res.status(400).json({ error: "role and permissions are required" })
  }

  try {
    const roleRow = await resolveRoleRow(companyId, normalizedRole)

    if (!roleRow?.id) {
      return res.status(404).json({ error: "Role not found for company" })
    }

    let enabledKeys: string[] = []

    if (normalizedRole === "OWNER") {
      const { data: ownerPermissions, error: ownerPermissionError } = await supabaseAdmin
        .from("permissions")
        .select("key")
        .eq("is_active", true)

      if (ownerPermissionError) throw ownerPermissionError

      enabledKeys = (ownerPermissions || [])
        .map((permission: any) => permission.key)
        .filter((key: string | null | undefined): key is string => Boolean(key))
    } else {
      enabledKeys = Object.entries(permissions)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([key]) => key)
    }

    const { data: permissionRows, error: permissionError } = enabledKeys.length
      ? await supabaseAdmin
          .from("permissions")
          .select("id, key")
          .in("key", enabledKeys)
      : { data: [], error: null as any }

    if (permissionError) throw permissionError

    const { error: deleteError } = await supabaseAdmin
      .from("role_permissions")
      .delete()
      .eq("company_id", companyId)
      .eq("role_id", roleRow.id)

    if (deleteError) throw deleteError

    const resolvedPermissionRows = permissionRows || []

    if (resolvedPermissionRows.length) {
      const rows = resolvedPermissionRows.map((permission: any) => ({
        company_id: companyId,
        role_id: roleRow.id,
        permission_id: permission.id,
      }))

      const { error: insertError } = await supabaseAdmin
        .from("role_permissions")
        .insert(rows)

      if (insertError) throw insertError
    }

    res.json({ success: true })
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

app.use((_, res) => {
  res.status(404).json({ error: "Route not found" })
})

app.use((err: any, req: any, res: any, next: any) => {
  console.error("ERROR:", err)
  res.status(500).json({ error: err.message })
})

// Start retry engine and wire event bus -> webhook delivery
try {
  startRetryEngine()
} catch (e:any) {
  console.error('Failed to start retry engine', e.message || e)
}

try {
  startEventProcessor()
} catch (e:any) {
  console.error('Failed to start event processor', e.message || e)
}

// Forward published events to configured webhook endpoints
eventBus.on('*', async (ev: any) => {
  try {
    // fetch endpoints matching company or global
    const { data: endpoints, error } = await supabaseAdmin
      .from('webhook_endpoints')
      .select('*')
      .or(`company_id.eq.${ev.company_id},company_id.is.null`)
      .eq('is_enabled', true)

    if (error) {
      console.error('Failed to load webhook endpoints', error.message)
      return
    }

    const matches = (endpoints || []).filter((ep: any) => {
      try {
        const subs = Array.isArray(ep.events) ? ep.events : []
        if (!subs.length) return true
        return subs.includes(ev.event) || subs.includes('*')
      } catch (e) { return false }
    })

    await Promise.all(matches.map((ep: any) => deliverWebhook(ep, ev)))
  } catch (e:any) {
    console.error('Event->webhook failed', e.message || e)
  }
})

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`)
})
