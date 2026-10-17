function getRequestedCompanyId(req: any) {
  const candidate =
    req.headers["x-company-id"] ||
    req.headers["x-tenant-company-id"] ||
    req.query?.company_id ||
    req.body?.company_id ||
    req.params?.companyId

  return typeof candidate === "string" ? candidate : null
}

function getRequestedOutletId(req: any) {
  const candidate =
    req.headers["x-outlet-id"] ||
    req.headers["x-tenant-outlet-id"] ||
    req.query?.outlet_id ||
    req.body?.outlet_id ||
    req.params?.outletId

  return typeof candidate === "string" ? candidate : null
}

export function requireCompanyAccess() {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      // allow api-key auth via req.auth
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" })
    }

    const requestedCompanyId =
      getRequestedCompanyId(req) || req.auth?.company_id || req.user?.company_id

    // If api key flow, check assigned company
    if (req.auth) {
      if (!requestedCompanyId || requestedCompanyId !== req.auth.company_id) {
        return res.status(403).json({ error: "Company access denied" })
      }
      return next()
    }

    const hasCompanyAccess = (req.user.companies || []).some(
      (company: any) => company.id === requestedCompanyId
    )

    if (!requestedCompanyId || !hasCompanyAccess) {
      return res.status(403).json({
        error: "Company access denied",
      })
    }

    next()
  }
}

export function requireOutletAccess(options?: { optional?: boolean }) {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" })
    }
    const requestedOutletId = getRequestedOutletId(req) || req.auth?.outlet_ids?.[0] || req.user?.outlet_id

    if (!requestedOutletId) {
      if (options?.optional) {
        return next()
      }

      return res.status(400).json({
        error: "outlet_id is required",
      })
    }

    // If api-key flow, validate against allowed outlet_ids
    if (req.auth) {
      const allowed = Array.isArray(req.auth.outlet_ids) ? req.auth.outlet_ids : []
      if (!allowed.includes(requestedOutletId)) {
        return res.status(403).json({ error: "Unauthorized outlet access" })
      }
      return next()
    }

    const hasOutletAccess =
      req.user.is_owner ||
      (req.user.outlets || []).some((outlet: any) => outlet.id === requestedOutletId)

    if (!hasOutletAccess) {
      return res.status(403).json({
        error: "Outlet access denied",
      })
    }

    next()
  }
}

export function requirePermission(permission: string) {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" })
    }
    // api-key flow: check attached permissions
    if (req.auth) {
      const perms = req.auth.permissions || {}
      if (perms.all || perms[permission]) return next()
      return res.status(403).json({ error: `Missing permission: ${permission}` })
    }

    // owner always allowed
    if (req.user.is_owner) return next()

    const perms = req.user.permissions || {}

    if (perms.all || perms[permission]) {
      return next()
    }

    return res.status(403).json({
      error: `Missing permission: ${permission}`,
    })
  }
}
