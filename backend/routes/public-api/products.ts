import express from 'express'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import {
  requireCompanyAccess,
  requireOutletAccess,
  requirePermission
} from '../../middleware/permissionMiddleware'


const router = express.Router()



router.get(
  '/',
  requireCompanyAccess(),
  requireOutletAccess({ optional: true }),
  requirePermission("products.read"), 
  async (req: any, res) => {
  try {
    const auth = req.auth || {}
    const companyId = req.query.company_id || auth.company_id

    const page = Math.max(1, Number(req.query.page || 1))
    const perPage = Math.min(100, Math.max(1, Number(req.query.per_page || 50)))
    const offset = (page - 1) * perPage

    const query = supabaseAdmin.from('menu_items').select('*')
    if (companyId) query.eq('company_id', companyId)
    if (req.query.updated_after) query.gt('updated_at', req.query.updated_after)
    if (req.query.created_after) query.gt('created_at', req.query.created_after)
    if (req.query.status) query.eq('status', req.query.status)

    const { data, error, count } = await query.range(offset, offset + perPage - 1).order('updated_at', { ascending: false })
    if (error) throw error
    res.json({ data, meta: { page, per_page: perPage, count } })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
