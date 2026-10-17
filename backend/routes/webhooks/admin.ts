import express from 'express'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { requireCompanyAccess, requirePermission } from '../../middleware/permissionMiddleware'

const router = express.Router()

// Protected admin: create webhook endpoint
router.post('/endpoints', requirePermission('manage_webhooks'), async (req: any, res) => {
  try {
    const companyId = req.user.company_id
    const { url, events, secret, name, enabled } = req.body
    if (!url || !events) return res.status(400).json({ error: 'url and events required' })

    const { data, error } = await supabaseAdmin.from('webhook_endpoints').insert({
      company_id: companyId,
      url,
      events,
      secret,
      name: name || null,
      is_enabled: enabled !== false,
    }).select('*').single()

    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/endpoints', requirePermission('manage_webhooks'), async (req: any, res) => {
  try {
    const companyId = req.user.company_id
    const { data, error } = await supabaseAdmin.from('webhook_endpoints').select('*').eq('company_id', companyId)
    if (error) throw error
    res.json(data)
  } catch (err:any) { res.status(400).json({ error: err.message }) }
})

router.post('/endpoints/:id/test', requirePermission('manage_webhooks'), async (req: any, res) => {
  try {
    const id = req.params.id
    const { data: endpoint, error } = await supabaseAdmin.from('webhook_endpoints').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!endpoint) return res.status(404).json({ error: 'Not found' })

    // fire a test event via webhook_deliveries using the delivery service
    const event = {
      event: 'test.papa',
      module: 'admin',
      company_id: endpoint.company_id,
      outlet_id: null,
      resource_id: null,
      timestamp: new Date().toISOString(),
      payload: { test: true },
      version: '1.0'
    }

    // dynamic import to avoid circular deps
    const { deliverWebhook } = await import('../../services/webhookDelivery')
    const result = await deliverWebhook(endpoint, event)
    res.json(result)
  } catch (err:any) { res.status(400).json({ error: err.message }) }
})

export default router
