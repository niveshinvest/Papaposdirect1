import express from 'express'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import {
  requireCompanyAccess,
  requireOutletAccess,
  requirePermission
} from '../../middleware/permissionMiddleware'

const router = express.Router()

// POST /public-api/sales  (server-side create with FIFO inventory consumption)
router.post(
  '/',
  requireCompanyAccess(),
  requireOutletAccess({ optional: true }),
  requirePermission('sales.create'),
  async (req: any, res) => {
    try {
      const payload = req.body || {}
      // attach user id for audit
      payload.user_id = req.auth?.user_id || null

      // Call RPC that inserts invoice and consumes FIFO stock atomically
      const { data, error } = await supabaseAdmin.rpc('create_invoice_with_inventory', { p_payload: payload }) as any
      if (error)
      {
console.log('Error creating invoice with inventory:', error.details || error.message || error)
 throw error
      }
       
      res.json({ data })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  }
)


// GET /public-api/sales
// supports pagination, filters, updated_after, created_after, outlet/company filtering
router.get(
  '/',
  requireCompanyAccess(),
  requireOutletAccess({ optional: true }),
  requirePermission("sales.read"), 
  async (req: any, res) => {
    try {
      const auth = req.auth || {}



     

      const companyId = req.query.company_id || auth.company_id
      const outletId = req.query.outlet_id || (Array.isArray(auth.outlet_ids) ? auth.outlet_ids[0] : null)

      
      const page = Math.max(1, Number(req.query.page || 1))
      const perPage =  Math.min(100, Math.max(1, Number(req.query.per_page || 50)))
      const limit= Math.min(100, Math.max(1, Number(req.query.limit || 50)))
      const cursor = req.query.cursor
      
      const offset = (page - 1) * perPage

      


      const query = supabaseAdmin
        .from('invoices')
        .select('*', { count: 'exact' })

      if (companyId) query.eq('company_id', companyId)
      if (outletId) query.eq('outlet_id', outletId)

      // ✅ Existing filters
      if (req.query.updated_after) query.gt('updated_at', req.query.updated_after)
      if (req.query.created_after) query.gt('created_at', req.query.created_after)
      if (req.query.status) query.eq('status', req.query.status)

      // ✅ NEW: Date range filter (recommended: invoice_date)
      if (req.query.from_date) {
        query.gte('invoice_date', req.query.from_date)
      }

      if (req.query.to_date) {
        query.lte('invoice_date', req.query.to_date)
      }

      if (cursor) {
        query.lt('updated_at', cursor)
     }





      // 🔁 Alternative (if you want on created_at instead)
      // if (req.query.created_from) query.gte('created_at', req.query.created_from)
      // if (req.query.created_to) query.lte('created_at', req.query.created_to)

      const { data, error, count } = await query
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)

       // .range(offset, offset + perPage - 1)

      if (error) throw error

      const nextCursor =
  data && data.length
    ? data[data.length - 1].updated_at
    : null

    res.json({
  data,
  meta: {
    next_cursor: nextCursor,
    limit
  }
})

  /*
      res.json({
        data,
        meta: {
          page,
          per_page: perPage,
          count
        }
      })
 */
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  }
)

export default router
