import { supabaseAdmin } from '../../lib/supabaseAdmin'
import eventBus from '../../services/eventBus'

const POLL_INTERVAL = 10 * 1000 // 10s

async function processQueueOnce() {
  try {
    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('event_queue')
      .select('*')
      .eq('processed', false)
      .lte('next_attempt_at', now)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) {
      console.error('Event processor read error', error.message)
      return
    }

    if (!data || !data.length) return

    await Promise.all(data.map(async (row: any) => {
      try {
        // publish asynchronously but await here to capture errors and mark processed
        await eventBus.publish({
          event: row.event,
          module: row.module,
          company_id: row.company_id,
          outlet_id: row.outlet_id,
          resource_id: row.resource_id,
          timestamp: row.created_at,
          payload: row.payload,
          version: '1.0'
        })

        await supabaseAdmin.from('event_queue').update({ processed: true, processed_at: new Date().toISOString() }).eq('id', row.id)
      } catch (err: any) {
        console.error('Failed to publish event', row.id, err?.message || err)
        const attempts = (row.attempts || 0) + 1
        const nextDelay = Math.min(24 * 60 * 60 * 1000, Math.pow(2, attempts) * 1000 * 60)
        const nextAttemptAt = new Date(Date.now() + nextDelay).toISOString()
        await supabaseAdmin.from('event_queue').update({ attempts, last_error: String(err?.message || err), next_attempt_at: nextAttemptAt }).eq('id', row.id)
      }
    }))
  } catch (e:any) {
    console.error('Event processor error', e?.message || e)
  }
}

export function startEventProcessor() {
  // initial run
  processQueueOnce().catch((e) => console.error(e))
  setInterval(processQueueOnce, POLL_INTERVAL)
}

export default { startEventProcessor }
