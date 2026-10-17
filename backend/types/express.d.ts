import "express"

declare global {
  namespace Express {
    interface Request {
      user?: any
      profile_id?: string
      company_id?: string
      outlet_id?: string
      role?: string
    }
  }
}

export {}
