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
      return res.status(401).json({ error: "Unauthorized" })
    }

    const requestedCompanyId = getRequestedCompanyId(req) || req.user.company_id
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
      return res.status(401).json({ error: "Unauthorized" })
    }

    const requestedOutletId = getRequestedOutletId(req) || req.user.outlet_id

    if (!requestedOutletId) {
      if (options?.optional) {
        return next()
      }

      return res.status(400).json({
        error: "outlet_id is required",
      })
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
      return res.status(401).json({ error: "Unauthorized" })
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
