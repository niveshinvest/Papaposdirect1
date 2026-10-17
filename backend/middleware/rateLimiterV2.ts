import { Request, Response, NextFunction } from 'express'
import { rateLimiter } from '../lib/rateLimiter'

import { WindowType } from '../lib/rateLimiter/adapters'

function floorWindow(date: Date, window: WindowType) {
  const d = new Date(date)
  if (window === 'minute') {
    d.setSeconds(0, 0)
    return d
  }
  if (window === 'hour') {
    d.setMinutes(0, 0, 0)
    return d
  }
  // day
  d.setHours(0, 0, 0, 0)
  return d
}

function deriveLimits(rateLimit: number | null, windowType: 'hour' | 'day') {
  const rl = Number(rateLimit || 0)
  if (!rl || rl <= 0) return { minute: 1000, hour: 0, day: 0 }
  if (windowType === 'hour') {
    return { minute: Math.max(10, Math.ceil(rl / 60)), hour: rl, day: rl * 24 }
  }
  // day
  return { minute: Math.max(10, Math.ceil(rl / (24 * 60))), hour: Math.max(100, Math.ceil(rl / 24)), day: rl }
}

export default function rateLimiterMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth: any = (req as any).auth
      if (!auth || !auth.api_key_id) return next()

      const apiKeyId = String(auth.api_key_id)
      const companyId = String(auth.company_id)
      const outletId = (auth.outlet_ids && auth.outlet_ids[0]) ? String(auth.outlet_ids[0]) : null

      const now = new Date()
      const minuteStart = floorWindow(now, 'minute')
      const hourStart = floorWindow(now, 'hour')
      const dayStart = floorWindow(now, 'day')

      const rate_limit = Number(auth.rate_limit) || null
      const windowPref = auth.rate_limit_window === 'hour' ? 'hour' : 'day'
      const limits = deriveLimits(rate_limit, windowPref)

      // increment minute
      const minuteRes = await rateLimiter.increment(apiKeyId, companyId, outletId, 'minute', minuteStart, 1)
      if (limits.minute && minuteRes.count > limits.minute) {
        const retry = 60
        return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', limit: limits.minute, window: 'minute', retry_after: retry })
      }

      // increment hour
      const hourRes = await rateLimiter.increment(apiKeyId, companyId, outletId, 'hour', hourStart, 0)
      if (limits.hour && limits.hour > 0 && hourRes.count > limits.hour) {
        const retry = Math.ceil((new Date(hourStart).getTime() + 60 * 60 * 1000 - now.getTime()) / 1000)
        return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', limit: limits.hour, window: 'hour', retry_after: retry })
      }

      // increment day
      const dayRes = await rateLimiter.increment(apiKeyId, companyId, outletId, 'day', dayStart, 0)
      if (limits.day && limits.day > 0 && dayRes.count > limits.day) {
        const retry = Math.ceil((new Date(dayStart).getTime() + 24 * 60 * 60 * 1000 - now.getTime()) / 1000)
        return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', limit: limits.day, window: 'day', retry_after: retry })
      }

      // set headers
      res.setHeader('X-RateLimit-Limit-Minute', String(limits.minute))
      res.setHeader('X-RateLimit-Minute-Used', String(minuteRes.count))
      res.setHeader('X-RateLimit-Limit-Hour', String(limits.hour))
      res.setHeader('X-RateLimit-Hour-Used', String(hourRes.count || 0))
      res.setHeader('X-RateLimit-Limit-Day', String(limits.day))
      res.setHeader('X-RateLimit-Day-Used', String(dayRes.count || 0))

      return next()
    } catch (e:any) {
      console.error('rateLimiterMiddleware error', e?.message || e)
      // fail-open: do not block traffic if limiter fails
      return next()
    }
  }
}
