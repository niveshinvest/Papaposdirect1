import Redis from "ioredis"
import { RedisAdapter, MemoryAdapter } from "./rateLimiter/adapters"

let redis: Redis | null = null

export function initRateLimiter() {
  const url = process.env.REDIS_URL

  if (!url) {
    console.warn("REDIS_URL not found → using MemoryAdapter")
    return null
  }

  redis = new Redis(url)

  redis.on("error", (e) => {
    console.error("Redis error:", e)
  })

  console.log("Redis connected for rate limiter")

  return redis
}

export function getRedis() {
  return redis
}

/**
 * Safe fallback:
 * - If REDIS_URL exists → RedisAdapter
 * - If REDIS_URL missing → MemoryAdapter
 */
const redisClient = initRateLimiter()

const rateLimiter = redisClient
  ? new RedisAdapter(redisClient)
  : new MemoryAdapter()

export { rateLimiter }
export default rateLimiter

/**
 * Legacy counter helper (used by old middleware if still needed)
 */
export async function incrementKeyCounter(
  apiKeyId: string,
  window: "hour" | "day",
  limit: number
) {
  const r = getRedis()
  const now = new Date()

  let bucketKey: string

  if (window === "hour") {
    const hour = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}-${now.getUTCHours()}`
    bucketKey = `rl:${apiKeyId}:h:${hour}`
  } else {
    const day = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`
    bucketKey = `rl:${apiKeyId}:d:${day}`
  }

  const ttl = window === "hour"
    ? 60 * 60
    : 24 * 60 * 60

  const count = await r.incr(bucketKey)

  if (count === 1) {
    await r.expire(bucketKey, ttl)
  }

  const pttl = await r.pttl(bucketKey)
  const ttlSeconds = Math.max(
    0,
    Math.ceil((pttl || 0) / 1000)
  )

  return {
    count,
    limit,
    ttl: ttlSeconds,
    bucketKey
  }
}