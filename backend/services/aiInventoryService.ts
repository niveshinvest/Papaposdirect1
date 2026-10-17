import { supabaseAdmin } from '../lib/supabaseAdmin'

/**
 * Very small natural-language to RPC mapper for inventory insights.
 * Keeps things simple: pattern-match a few common queries and call the
 * corresponding RPCs added in migrations/204_ai_insights.sql
 */
export async function handleQuery(user: any, query: string, opts: { company?: string | null, outlet?: string | null }) {
  const q = (query || '').toLowerCase().trim()

  if (q.includes('low stock') || q.includes('low-stock') || q.includes('show low stock')) {
    const { data, error } = await supabaseAdmin.rpc('get_low_stock', { p_company: opts.company || null, p_outlet: opts.outlet || null, p_limit: 100 }) as any
    if (error) throw error
    return { kind: 'low_stock', data }
  }

  if (q.includes('dead stock') || q.includes('deadstock') || q.includes('not sold')) {
    const daysMatch = q.match(/(\d+)\s*days/)
    const days = daysMatch ? Number(daysMatch[1]) : 90
    const { data, error } = await supabaseAdmin.rpc('get_dead_stock', { p_company: opts.company || null, p_outlet: opts.outlet || null, p_days: days, p_limit: 200 }) as any
    if (error) throw error
    return { kind: 'dead_stock', data }
  }

  if (q.includes('fast moving') || q.includes('best selling') || q.includes('top selling') || q.includes('fast-moving')) {
    const daysMatch = q.match(/(\d+)\s*days/)
    const days = daysMatch ? Number(daysMatch[1]) : 30
    const limitMatch = q.match(/top\s*(\d+)/)
    const limit = limitMatch ? Number(limitMatch[1]) : 20
    const { data, error } = await supabaseAdmin.rpc('get_fast_moving_items', { p_company: opts.company || null, p_outlet: opts.outlet || null, p_days: days, p_limit: limit }) as any
    if (error) throw error
    return { kind: 'fast_moving', data }
  }

  if (q.includes('expiring') || q.includes('expiring soon') || q.includes('expiry')) {
    const daysMatch = q.match(/(\d+)\s*days/)
    const days = daysMatch ? Number(daysMatch[1]) : 30
    const { data, error } = await supabaseAdmin.rpc('get_expiry_alerts', { p_outlet: opts.outlet || null, p_days: days, p_limit: 200 }) as any
    if (error) throw error
    return { kind: 'expiry', data }
  }

  // Supplier price comparison: "compare supplier price for ITEM_ID"
  if (q.includes('supplier price') || q.includes('price comparison') || q.includes('supplier comparison')) {
    const idMatch = q.match(/[0-9a-fA-F\-]{36}/)
    const itemId = idMatch ? idMatch[0] : null
    if (!itemId) throw new Error('Please provide an item UUID to compare supplier prices.')
    const { data, error } = await supabaseAdmin.rpc('get_supplier_price_comparison', { p_item: itemId }) as any
    if (error) throw error
    return { kind: 'supplier_prices', data }
  }

  // fallback: try fast-moving
  const { data, error } = await supabaseAdmin.rpc('get_fast_moving_items', { p_company: opts.company || null, p_outlet: opts.outlet || null, p_days: 30, p_limit: 10 }) as any
  if (error) throw error
  return { kind: 'fast_moving', data }
}

export default { handleQuery }
