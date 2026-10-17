import { getRedis, incrementKeyCounter } from '../lib/rateLimiter'

export default function rateLimitMiddleware() {
  return async (req: any, res: any, next: any) => {
    try {
      const auth = req.auth
      if (!auth || !auth.api_key_id) return next()

      const limit = Number(auth.rate_limit) || 0
      const window = auth.rate_limit_window === 'hour' ? 'hour' : 'day'

      if (!limit || limit <= 0) return next()

      const { count, ttl } = await incrementKeyCounter(String(auth.api_key_id), window as any, limit)

      const remaining = Math.max(0, limit - count)
      const resetAt = Math.floor(Date.now() / 1000) + (ttl || 0)

      // Set standard rate limit headers
      res.setHeader('X-RateLimit-Limit', String(limit))
      res.setHeader('X-RateLimit-Remaining', String(remaining))
      res.setHeader('X-RateLimit-Reset', String(resetAt))

      if (count > limit) {
        return res.status(429).json({ error: 'Rate limit exceeded', limit, remaining: 0, reset: resetAt })
      }

      return next()
    } catch (e: any) {
      console.error('Rate limiter error', e)
      return res.status(500).json({ error: 'Rate limiter failure' })
    }
  }
}
