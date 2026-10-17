import express from 'express'
import crypto from 'crypto'
import secureFrom, { secureOp } from '../lib/safeDb'
import { supabaseAdmin } from '../lib/supabaseAdmin'

const router = express.Router()

import { validatePermissionsList, normalizePermissionsToMap } from '../lib/permissions'

function generateKey() {
  const rand = crypto.randomBytes(16).toString('hex') // 32 chars
  return `pp_live_${rand}`
}

function maskKey(key: string) {
  if (!key) return ''
  // show prefix and first 3 chars then mask rest
  const prefix = key.slice(0, 11) // 'pp_live_xxxxx'
  const rest = key.slice(11)
  const visible = rest.slice(0, 3)
  return `${prefix}${visible}${'*'.repeat(Math.max(8, rest.length - 3))}`
}

function hashKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

function ensureAuth(req: any) {
  const auth = req.auth || (req.user ? { company_id: req.user.company_id, outlet_ids: (req.user.outlets || []).map((o: any) => o.id) } : null)
  if (!auth || !auth.company_id || !auth.outlet_ids || !auth.outlet_ids.length) {
    throw new Error('Missing auth or outlet access')
  }
  return auth
}

// Create
router.post('/create', async (req: any, res) => {
  try {
    const auth = ensureAuth(req)

    const name = String(req.body?.name || '').trim()
    const outlet_ids = Array.isArray(req.body?.outlet_ids) ? req.body.outlet_ids : []
    const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : []
    const rate_limit = typeof req.body?.rate_limit === 'number' ? req.body.rate_limit : null
    const rate_limit_window = req.body?.rate_limit_window === 'hour' ? 'hour' : 'day'
    const description = req.body?.description || null

    if (!name) return res.status(400).json({ error: 'name is required' })
    if (!outlet_ids.length) return res.status(400).json({ error: 'outlet_ids is required' })

    // ensure outlet_ids are subset of auth.outlet_ids
    const allowed = auth.outlet_ids
    //const invalid = outlet_ids.filter((id: string) => !allowed.includes(id))
    const invalidOutlets = outlet_ids.filter((id: string) => !allowed.includes(id))
if (invalidOutlets.length) {
  return res.status(403).json({ error: 'Unauthorized outlet access' })
}

// validate permissions
if (!permissions.length) {
  return res.status(400).json({ error: 'permissions are required' })
}
    
    
    
   // if (invalid.length) return res.status(403).json({ error: 'Unauthorized outlet access' })

    // validate permissions (must be non-empty array and canonical)
  //  if (!permissions.length) return res.status(400).json({ error: 'permissions are required' })
    //const { valid, invalid } = validatePermissionsList(permissions)

const validation = validatePermissionsList(permissions)
if (!validation.valid) {
  return res.status(400).json({
    error: `Unknown permissions: ${validation.invalid.join(', ')}`
  })
}

   // if (!valid) return res.status(400).json({ error: `Unknown permissions: ${invalid.join(', ')}` })

    const plainKey = generateKey()
    const keyHash = hashKey(plainKey)
    const keyMask = maskKey(plainKey)

    const payload: any = {
      key_hash: keyHash,
      key_mask: keyMask,
      name,
      company_id: auth.company_id,
      outlet_ids,
      permissions: normalizePermissionsToMap(permissions),
      is_active: true,
      rate_limit,
      rate_limit_window,
      description,
      created_at: new Date().toISOString()
    }

    // Insert using secureOp to enforce company
    const { data, error } = await secureOp('api_keys', auth).insert(payload)
    if (error) throw error

    // audit log
    await supabaseAdmin.from('audit_logs').insert({ company_id: auth.company_id, outlet_id: outlet_ids[0] || null, action: 'api_key.create', metadata: { id: data?.[0]?.id, name }, created_at: new Date().toISOString() })

    return res.json({
      id: data?.[0]?.id,
      name,
      api_key: plainKey,
      api_key_mask: keyMask,
    })
  } catch (e: any) {
    console.error('api-keys create error', e)
    return res.status(400).json({ error: e.message || 'Create failed' })
  }
})

// Friendly REST endpoints for frontend
router.post('/', async (req: any, res) => {
  try {
    const auth = ensureAuth(req)

    const name = String(req.body?.name || '').trim()
    const outlet_ids = Array.isArray(req.body?.outlet_ids) ? req.body.outlet_ids : []
    const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : []
    const validation = validatePermissionsList(permissions)
    if (!validation.valid) return res.status(400).json({ error: `Unknown permissions: ${validation.invalid.join(', ')}` })
    const rate_limit = typeof req.body?.rate_limit === 'number' ? req.body.rate_limit : null
    const rate_limit_window = req.body?.rate_limit_window === 'hour' ? 'hour' : 'day'
    const description = req.body?.description || null

    if (!name) return res.status(400).json({ error: 'name is required' })
    if (!outlet_ids.length) return res.status(400).json({ error: 'outlet_ids is required' })

    // ensure outlet_ids are subset of auth.outlet_ids
    const allowed = auth.outlet_ids
    const invalid = outlet_ids.filter((id: string) => !allowed.includes(id))
    if (invalid.length) return res.status(403).json({ error: 'Unauthorized outlet access' })

    if (!permissions.length) return res.status(400).json({ error: 'permissions are required' })

    const plainKey = generateKey()
    const keyHash = hashKey(plainKey)
    const keyMask = maskKey(plainKey)

    const payload: any = {
      key_hash: keyHash,
      key_mask: keyMask,
      name,
      company_id: auth.company_id,
      outlet_ids,
      permissions: normalizePermissionsToMap(permissions),
      is_active: true,
      rate_limit,
      rate_limit_window,
      description,
      created_at: new Date().toISOString()
    }

    const { data, error } = await secureOp('api_keys', auth).insert(payload)
    if (error) throw error

    await supabaseAdmin.from('audit_logs').insert({ company_id: auth.company_id, outlet_id: outlet_ids[0] || null, action: 'api_key.create', metadata: { id: data?.[0]?.id, name }, created_at: new Date().toISOString() })

    return res.json({ id: data?.[0]?.id, name, api_key: plainKey, api_key_mask: keyMask })
  } catch (e:any) {
    console.error('api-keys create (/) error', e)
    return res.status(400).json({ error: e.message || 'Create failed' })
  }
})

// List
router.get('/list', async (req: any, res) => {
  try {
    const auth = ensureAuth(req)

    const { data, error } = await secureFrom('api_keys', auth, '*')
      .order('created_at', { ascending: false })

    if (error) throw error

    // never return key_hash, only mask
    const rows = (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      api_key_mask: r.key_mask,
      outlet_ids: r.outlet_ids,
      permissions: r.permissions,
      is_active: r.is_active,
      rate_limit: r.rate_limit,
      created_at: r.created_at
    }))

    return res.json({ data: rows })
  } catch (e: any) {
    console.error('api-keys list error', e)
    return res.status(400).json({ error: e.message || 'List failed' })
  }
})

router.get('/', async (req: any, res) => {
  try {
    const auth = ensureAuth(req)
    const { data, error } = await secureFrom('api_keys', auth, '*')
      .order('created_at', { ascending: false })
    if (error) throw error
    const rows = (data || []).map((r: any) => ({ id: r.id, name: r.name, key_mask: r.key_mask, outlet_ids: r.outlet_ids, permissions: r.permissions, is_active: r.is_active, rate_limit: r.rate_limit, created_at: r.created_at }))
    return res.json(rows)
  } catch (e:any) {
    console.error('api-keys GET / error', e)
    return res.status(400).json({ error: e.message || 'List failed' })
  }
})

// Toggle status (enable/disable)
router.patch('/toggle-status', async (req: any, res) => {
  try {
    const auth = ensureAuth(req)
    const id = req.body?.id
    const is_active = Boolean(req.body?.is_active)
    if (!id) return res.status(400).json({ error: 'id is required' })

    // scope update by company and outlet_ids
    let q = supabaseAdmin.from('api_keys').update({ is_active }).eq('id', id).eq('company_id', auth.company_id)
    const { error } = await q
    if (error) throw error

    await supabaseAdmin.from('audit_logs').insert({ company_id: auth.company_id, outlet_id: auth.outlet_ids[0], action: 'api_key.toggle', metadata: { id, is_active }, created_at: new Date().toISOString() })

    return res.json({ success: true })
  } catch (e: any) {
    console.error('api-keys toggle error', e)
    return res.status(400).json({ error: e.message || 'Toggle failed' })
  }
})

router.post('/:id/toggle', async (req: any, res) => {
  try {
    const auth = ensureAuth(req)
    const id = req.params.id

    if (!id) {
      return res.status(400).json({ error: 'id required' })
    }

    // fetch current row
    const { data: row, error: fErr }: any = await secureFrom(
      'api_keys',
      auth,
      '*'
    )
      .eq('id', id)
      .maybeSingle()

    if (fErr) throw fErr

    if (!row) {
      return res.status(404).json({ error: 'Not found' })
    }

    const newStatus = !row.is_active

    const { error }: any = await supabaseAdmin
      .from('api_keys')
      .update({
        is_active: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('company_id', auth.company_id)

    if (error) throw error

    await supabaseAdmin.from('audit_logs').insert({
      company_id: auth.company_id,
      outlet_id: auth.outlet_ids[0],
      action: 'api_key.toggle',
      metadata: {
        id,
        is_active: newStatus
      },
      created_at: new Date().toISOString()
    })

    return res.json({
      success: true
    })
  } catch (e: any) {
    console.error('api-keys toggle by id error', e)
    return res.status(400).json({
      error: e.message || 'Toggle failed'
    })
  }
})

// Delete
router.delete('/delete', async (req: any, res) => {
  try {
    const auth = ensureAuth(req)
    const id = req.body?.id || req.query?.id
    if (!id) return res.status(400).json({ error: 'id is required' })

    const { error } = await supabaseAdmin.from('api_keys').delete().eq('id', id).eq('company_id', auth.company_id)
    if (error) throw error

    await supabaseAdmin.from('audit_logs').insert({ company_id: auth.company_id, outlet_id: auth.outlet_ids[0], action: 'api_key.delete', metadata: { id }, created_at: new Date().toISOString() })

    return res.json({ success: true })
  } catch (e: any) {
    console.error('api-keys delete error', e)
    return res.status(400).json({ error: e.message || 'Delete failed' })
  }
})

router.delete('/:id', async (req:any, res) => {
  try {
    const auth = ensureAuth(req)
    const id = req.params.id
    if (!id) return res.status(400).json({ error: 'id is required' })
    const { error } = await supabaseAdmin.from('api_keys').delete().eq('id', id).eq('company_id', auth.company_id)
    if (error) throw error
    await supabaseAdmin.from('audit_logs').insert({ company_id: auth.company_id, outlet_id: auth.outlet_ids[0], action: 'api_key.delete', metadata: { id }, created_at: new Date().toISOString() })
    return res.json({ success: true })
  } catch (e:any) {
    console.error('api-keys delete by id error', e)
    return res.status(400).json({ error: e.message || 'Delete failed' })
  }
})

// Regenerate
router.post('/regenerate', async (req: any, res) => {
  try {
    const auth = ensureAuth(req)
    const id = req.body?.id
    if (!id) return res.status(400).json({ error: 'id is required' })

    // Fetch row and ensure company
    const { data: rows, error: fetchErr } = await secureFrom('api_keys', auth, '*').eq('id', id).maybeSingle()
    if (fetchErr) throw fetchErr
    if (!rows) return res.status(404).json({ error: 'Not found' })

    const plainKey = generateKey()
    const keyHash = hashKey(plainKey)
    const keyMask = maskKey(plainKey)

    const { error } = await supabaseAdmin.from('api_keys').update({ key_hash: keyHash, key_mask: keyMask, updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', auth.company_id)
    if (error) throw error

    await supabaseAdmin.from('audit_logs').insert({ company_id: auth.company_id, outlet_id: auth.outlet_ids[0], action: 'api_key.regenerate', metadata: { id }, created_at: new Date().toISOString() })

    return res.json({ id, api_key: plainKey, api_key_mask: keyMask })
  } catch (e: any) {
    console.error('api-keys regenerate error', e)
    return res.status(400).json({ error: e.message || 'Regenerate failed' })
  }
})

router.post('/:id/regenerate', async (req:any, res) => {
  try {
    const auth = ensureAuth(req)
    const id = req.params.id
    if (!id) return res.status(400).json({ error: 'id is required' })
    const { data: rows, error: fetchErr } = await secureFrom('api_keys', auth, '*').eq('id', id).maybeSingle()
    if (fetchErr) throw fetchErr
    if (!rows) return res.status(404).json({ error: 'Not found' })
    const plainKey = generateKey()
    const keyHash = hashKey(plainKey)
    const keyMask = maskKey(plainKey)
    const { error } = await supabaseAdmin.from('api_keys').update({ key_hash: keyHash, key_mask: keyMask, updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', auth.company_id)
    if (error) throw error
    await supabaseAdmin.from('audit_logs').insert({ company_id: auth.company_id, outlet_id: auth.outlet_ids[0], action: 'api_key.regenerate', metadata: { id }, created_at: new Date().toISOString() })
    return res.json({ id, api_key: plainKey, api_key_mask: keyMask })
  } catch (e:any) {
    console.error('api-keys regenerate by id error', e)
    return res.status(400).json({ error: e.message || 'Regenerate failed' })
  }
})

export default router
