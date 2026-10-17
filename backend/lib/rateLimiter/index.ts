import { MemoryAdapter, DBAdapter, RateLimiterAdapter, WindowType } from './adapters'
import { supabaseAdmin } from '../supabaseAdmin'

type Key = string

export interface RateLimiterOptions {
  memoryFlushThreshold?: number
  memoryFlushIntervalMs?: number
}

export class RateLimiter {
  private memory: MemoryAdapter
  private db: DBAdapter
  private flushIntervalId: any = null
  private flushIntervalMs: number
  private flushThreshold: number

  constructor(opts?: RateLimiterOptions) {
    this.memory = new MemoryAdapter(60 * 60) // default TTL 1h per key
    this.db = new DBAdapter()
    this.flushIntervalMs = opts?.memoryFlushIntervalMs ?? 5000
    this.flushThreshold = opts?.memoryFlushThreshold ?? 50
    this.startFlushLoop()
  }

  private startFlushLoop() {
    if (this.flushIntervalId) return
    this.flushIntervalId = setInterval(() => this.flushMemoryToDb().catch(e => console.error('flushMemoryToDb', e)), this.flushIntervalMs)
  }

  private stopFlushLoop() {
    if (!this.flushIntervalId) return
    clearInterval(this.flushIntervalId)
    this.flushIntervalId = null
  }

  private parseMemoryKey(k: string) {
    // format: companyId:outletId:apiKeyId:window:iso
    const parts = k.split(':')
    const companyId = parts[0]
    const outletId = parts[1] === 'null' ? null : parts[1]
    const apiKeyId = parts[2]
    const window = parts[3] as WindowType
    const iso = parts.slice(4).join(':')
    return { companyId, outletId, apiKeyId, window, iso }
  }

  async flushMemoryToDb() {
    const entries = this.memory.snapshotAndClear()
    if (!entries.length) return
    for (const e of entries) {
      try {
        const parsed = this.parseMemoryKey(e.key)
        const windowStart = new Date(parsed.iso)
        await this.db.increment(parsed.apiKeyId, parsed.companyId || '', parsed.outletId, parsed.window as WindowType, windowStart, e.count)
      } catch (err) {
        console.error('Failed to flush memory key', e.key, err)
      }
    }
  }

  async increment(apiKeyId: string, companyId: string, outletId: string | null, window: WindowType, windowStart: Date, increment = 1) {
    // Fast path: memory
    const mem = await this.memory.increment(apiKeyId, companyId, outletId, window, windowStart, increment)
    // If memory count exceeds a threshold, flush it to DB immediately
    if ((mem.count ?? 0) >= this.flushThreshold) {
      // flush this key only
      try {
        await this.db.increment(apiKeyId, companyId, outletId, window, windowStart, mem.count)
      } catch (e) {
        console.error('flush single key failed', e)
      }
    }
    // Also return DB count via separate increment of 0 to get authoritative count
    try {
      const dbRes = await this.db.increment(apiKeyId, companyId, outletId, window, windowStart, 0)
      return { count: dbRes.count }
    } catch (e) {
      // DB operation failed — return memory count as best-effort
      return { count: mem.count }
    }
  }
}

// singleton
export const rateLimiter = new RateLimiter()
