import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { deliverWebhook } from '../../services/webhookDelivery'

const PROCESS_INTERVAL = 30 * 1000 // 30s

async function processFailures() {
  // pick eligible failures
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('sync_failures')
    .select('*')
    .lte('next_attempt_at', now)
    .order('next_attempt_at', { ascending: true })
    .limit(20)

  if (error) {
    console.error('Retry engine read error', error.message)
    return
  }

  if (!data || !data.length) return

  await Promise.all(data.map(async (row: any) => {
    try {
      const { data: endpoint } = await supabaseAdmin.from('webhook_endpoints').select('*').eq('id', row.webhook_endpoint_id).maybeSingle()
      if (!endpoint) {
        // mark dead
        await supabaseAdmin.from('sync_failures').update({ dead_letter: true }).eq('id', row.id)
        return
      }

      const result = await deliverWebhook(endpoint, row.payload)

      const attempts = (row.attempts || 0) + 1
      const nextDelay = Math.min(24 * 60 * 60 * 1000, Math.pow(2, attempts) * 1000 * 60) // exponential backoff in ms
      const nextAttemptAt = new Date(Date.now() + nextDelay).toISOString()

      if (result.ok) {
        await supabaseAdmin.from('sync_failures').delete().eq('id', row.id)
      } else {
        await supabaseAdmin.from('sync_failures').update({ attempts, last_error: result.error || 'delivery failed', next_attempt_at: nextAttemptAt }).eq('id', row.id)
      }
    } catch (e:any) {
      console.error('Retry failed processing row', e.message || e)
    }
  }))
}

export function startRetryEngine() {
  setInterval(processFailures, PROCESS_INTERVAL)
}

export default { startRetryEngine }
