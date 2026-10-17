import Redis from "ioredis"
import { supabaseAdmin } from "../supabaseAdmin"

export type WindowType = "minute" | "hour" | "day"

export interface RateLimiterAdapter {
  increment(
    apiKeyId: string,
    companyId: string,
    outletId: string | null,
    window: WindowType,
    windowStart: Date,
    increment?: number
  ): Promise<{
    count: number
    ttlSeconds?: number
  }>

  checkLimit?(...args: any[]): Promise<any>
  resetWindow?(...args: any[]): Promise<any>
}

export class RedisAdapter implements RateLimiterAdapter {
  private redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  async increment(
    apiKeyId: string,
    companyId: string,
    outletId: string | null,
    window: WindowType,
    windowStart: Date,
    increment = 1
  ): Promise<{ count: number; ttlSeconds?: number }> {
    const outletPart = outletId || "null"

    const key = `rl:${companyId}:${outletPart}:${apiKeyId}:${window}:${windowStart.toISOString()}`

    const count = await this.redis.incrby(key, increment)

    if (count === increment) {
      await this.redis.expire(
        key,
        window === "hour" ? 3600 : 86400
      )
    }

    const ttl = await this.redis.ttl(key)

    return {
      count,
      ttlSeconds: ttl > 0 ? ttl : undefined
    }
  }
}

export class MemoryAdapter implements RateLimiterAdapter {
  private map = new Map<
    string,
    { count: number; expiresAt: number }
  >()

  constructor(private defaultTtl = 60 * 60) {}

  private key(
    apiKeyId: string,
    companyId: string,
    outletId: string | null,
    window: WindowType,
    windowStart: Date
  ) {
    const outletPart = outletId || "null"
    return `${companyId}:${outletPart}:${apiKeyId}:${window}:${windowStart.toISOString()}`
  }

  async increment(
    apiKeyId: string,
    companyId: string,
    outletId: string | null,
    window: WindowType,
    windowStart: Date,
    increment = 1
  ): Promise<{ count: number; ttlSeconds?: number }> {
    const k = this.key(
      apiKeyId,
      companyId,
      outletId,
      window,
      windowStart
    )

    const now = Date.now()
    const existing = this.map.get(k)

    if (existing && existing.expiresAt > now) {
      existing.count += increment
      this.map.set(k, existing)

      return {
        count: existing.count,
        ttlSeconds: Math.max(
          0,
          Math.ceil((existing.expiresAt - now) / 1000)
        )
      }
    }

    const ttl = this.defaultTtl

    this.map.set(k, {
      count: increment,
      expiresAt: now + ttl * 1000
    })

    return {
      count: increment,
      ttlSeconds: ttl
    }
  }
}