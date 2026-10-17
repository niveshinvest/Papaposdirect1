import { supabaseAdmin } from '../lib/supabaseAdmin'
import crypto from 'crypto'

export async function createApiKey(params: {
  company_id: string
  outlet_ids: string[]
  permissions?: string[]
  expires_at?: string | null
}) {
  const raw = `pp_live_${crypto.randomBytes(32).toString('hex')}`
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const mask = `${raw.slice(0, 8)}...${raw.slice(-4)}`

  const { data, error } = await supabaseAdmin.from('api_keys').insert({
    company_id: params.company_id,
    outlet_ids: params.outlet_ids,
    permissions: params.permissions || [],
    expires_at: params.expires_at || null,
    key_hash: hash,
    key_mask: mask,
    is_active: true
  }).select('id').single()

  if (error) throw error
  return { api_key: raw, key_id: data.id, mask }
}

export async function revokeApiKey(id: string) {
  const { error } = await supabaseAdmin.from('api_keys').update({ is_active: false }).eq('id', id)
  if (error) throw error
  return true
}

export default { createApiKey, revokeApiKey }
