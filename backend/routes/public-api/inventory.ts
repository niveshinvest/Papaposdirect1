import express from 'express'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import {
  requireCompanyAccess,
  requireOutletAccess,
  requirePermission
} from '../../middleware/permissionMiddleware'
import * as inventoryService from '../../services/inventoryService'

const router = express.Router()

// GET /public-api/inventory
router.get('/', requireCompanyAccess(), requireOutletAccess({ optional: true }), requirePermission('inventory.read'), async (req: any, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1))
    const perPage = Math.min(100, Math.max(1, Number(req.query.per_page || 50)))
    const offset = (page - 1) * perPage

    const filters: any = {}
    if (req.query.outlet_id) filters.outlet_id = req.query.outlet_id
    if (req.query.category_id) filters.category_id = req.query.category_id
    if (req.query.brand_id) filters.brand_id = req.query.brand_id

    let query = supabaseAdmin
      .from('inventory_stock_summary')
      .select('*, items:items(id,name,sku,barcode,unit,default_brand_id)')

    if (filters.outlet_id) query = query.eq('outlet_id', filters.outlet_id)
    if (filters.category_id) query = query.eq('items.category_id', filters.category_id)
    if (filters.brand_id) query = query.eq('items.default_brand_id', filters.brand_id)

    const { data, error } = await query.range(offset, offset + perPage - 1).order('stock_value', { ascending: false })
    if (error) throw error
    res.json({ data, meta: { page, per_page: perPage } })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// GET /public-api/low-stock
router.get('/low-stock', requireCompanyAccess(), requirePermission('inventory.read'), async (req: any, res) => {
  try {
    const sql = `SELECT s.item_id, s.outlet_id, s.qty_available, i.name, i.reorder_level, i.min_stock_level
                 FROM inventory_stock_summary s
                 JOIN items i ON i.id = s.item_id
                 WHERE s.qty_available <= COALESCE(i.reorder_level, i.min_stock_level)`
    const { data, error } = await supabaseAdmin.rpc('run_sql', { sql }) as any
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// GET /public-api/expiry
router.get('/expiry', requireCompanyAccess(), requirePermission('inventory.read'), async (req: any, res) => {
  try {
    const days = Number(req.query.days || 30)
    const { data, error } = await supabaseAdmin
      .from('inventory_batches')
      .select('*')
      .lt('expiry_date', new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0,10))
      .order('expiry_date', { ascending: true })
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// POST /public-api/adjustment
router.post('/adjustment', requireCompanyAccess(), requirePermission('inventory.adjust'), async (req: any, res) => {
  try {
    const { outlet_id, reason, items } = req.body
    const result = await inventoryService.createAdjustment(req.auth.user_id, outlet_id, reason, items)
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// POST /public-api/consume (internal API used by sales to consume stock FIFO)
router.post('/consume', requireCompanyAccess(), requirePermission('inventory.consume'), async (req: any, res) => {
  try {
    const { item_id, outlet_id, qty } = req.body
    const result = await inventoryService.consumeStock(req.auth.user_id, item_id, outlet_id, Number(qty))
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// AI Insights endpoints
// GET /public-api/inventory/fast-moving
router.get('/fast-moving', requireCompanyAccess(), requirePermission('inventory.read'), async (req:any, res) => {
  try {
    const days = Number(req.query.days || 30)
    const limit = Number(req.query.limit || 20)
    const company = req.query.company_id || req.auth?.company_id || null
    const outlet = req.query.outlet_id || null
    const { data, error } = await supabaseAdmin.rpc('get_fast_moving_items', { p_company: company, p_outlet: outlet, p_days: days, p_limit: limit }) as any
    if (error) throw error
    res.json({ data })
  } catch (err:any) {
    res.status(400).json({ error: err.message })
  }
})

// GET /public-api/inventory/dead-stock
router.get('/dead-stock', requireCompanyAccess(), requirePermission('inventory.read'), async (req:any, res) => {
  try {
    const days = Number(req.query.days || 90)
    const limit = Number(req.query.limit || 100)
    const company = req.query.company_id || req.auth?.company_id || null
    const outlet = req.query.outlet_id || null
    const { data, error } = await supabaseAdmin.rpc('get_dead_stock', { p_company: company, p_outlet: outlet, p_days: days, p_limit: limit }) as any
    if (error) throw error
    res.json({ data })
  } catch (err:any) {
    res.status(400).json({ error: err.message })
  }
})

// GET /public-api/inventory/supplier-prices?item_id=...
router.get('/supplier-prices', requireCompanyAccess(), requirePermission('inventory.read'), async (req:any, res) => {
  try {
    const itemId = req.query.item_id
    if (!itemId) return res.status(400).json({ error: 'item_id required' })
    const { data, error } = await supabaseAdmin.rpc('get_supplier_price_comparison', { p_item: itemId }) as any
    if (error) throw error
    res.json({ data })
  } catch (err:any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
