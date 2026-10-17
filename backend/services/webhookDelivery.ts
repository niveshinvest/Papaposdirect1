import crypto from 'crypto'
import { supabaseAdmin } from '../lib/supabaseAdmin'

// Use global fetch when available (Node 18+), otherwise dynamically require node-fetch
function getFetch() {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Fetch is not available. Please use Node.js 18+')
  }

  return globalThis.fetch.bind(globalThis)
}

function hmacSignature(secret: string, payload: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export async function deliverWebhook(endpoint: any, event: any) {
  const payload = JSON.stringify(event)
  const signature = endpoint.secret ? hmacSignature(endpoint.secret, payload) : null

  const headers: any = {
    'Content-Type': 'application/json',
    'X-Papa-Event': event.event,
    'X-Papa-Version': event.version || '1.0',
    'X-Papa-Timestamp': event.timestamp || new Date().toISOString(),
  }
  if (signature) headers['X-Papa-Signature'] = signature

  try {
    const _fetch = await getFetch()
    const resp = await _fetch(endpoint.url, { method: 'POST', body: payload, headers, timeout: 15000 })
    const text = await resp.text()

    await supabaseAdmin.from('webhook_deliveries').insert({
      webhook_endpoint_id: endpoint.id,
      event: event.event,
      status: resp.status,
      response_body: text,
      delivered_at: new Date().toISOString(),
      resource_id: event.resource_id || null,
      company_id: event.company_id || null,
      outlet_id: event.outlet_id || null,
      attempt: 1
    })

    if (!resp.ok) {
      // push into sync_failures / event_queue for retry
      await supabaseAdmin.from('sync_failures').insert({
        webhook_endpoint_id: endpoint.id,
        event: event.event,
        payload: event,
        last_error: text,
        attempts: 1,
        next_attempt_at: new Date(Date.now() + 1000 * 60).toISOString()
      })
    }

    return { ok: resp.ok, status: resp.status, body: text }
  } catch (err: any) {
    const msg = String(err.message || err)
    await supabaseAdmin.from('webhook_deliveries').insert({
      webhook_endpoint_id: endpoint.id,
      event: event.event,
      status: 0,
      response_body: msg,
      delivered_at: new Date().toISOString(),
      resource_id: event.resource_id || null,
      company_id: event.company_id || null,
      outlet_id: event.outlet_id || null,
      attempt: 1
    })

    await supabaseAdmin.from('sync_failures').insert({
      webhook_endpoint_id: endpoint.id,
      event: event.event,
      payload: event,
      last_error: msg,
      attempts: 1,
      next_attempt_at: new Date(Date.now() + 1000 * 60).toISOString()
    })

    return { ok: false, error: msg }
  }
}

export default { deliverWebhook }
