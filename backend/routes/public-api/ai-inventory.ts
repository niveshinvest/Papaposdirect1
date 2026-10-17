import express from 'express'
import { requireCompanyAccess, requireOutletAccess, requirePermission } from '../../middleware/permissionMiddleware'
import aiInventoryService from '../../services/aiInventoryService'

const router = express.Router()

// POST /public-api/inventory/ai-query
// body: { query: string, outlet_id?: string, company_id?: string }
router.post('/ai-query', requireCompanyAccess(), requirePermission('inventory.read'), async (req:any, res) => {
  try {
    const body = req.body || {}
    const q = String(body.query || '')
    if (!q) return res.status(400).json({ error: 'query required' })
    const company = body.company_id || req.auth?.company_id || null
    const outlet = body.outlet_id || req.auth?.outlet_ids?.[0] || null

    const result = await aiInventoryService.handleQuery(req.auth, q, { company, outlet })
    res.json({ result })
  } catch (err:any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
