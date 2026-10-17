import { supabaseAdmin } from '../lib/supabaseAdmin'

export async function consumeStock(userId: string, itemId: string, outletId: string | null, qty: number) {
  // Call FIFO allocator RPC
  const rpcName = 'fifo_allocate_stock'
  const params: any = { p_item: itemId, p_outlet: outletId, p_required: qty }
  const { data: allocations, error: rpcError } = await supabaseAdmin.rpc(rpcName, params)
  if (rpcError) throw rpcError

  if (!allocations || allocations.length === 0) {
    return { success: false, message: 'Insufficient stock' }
  }

  // allocations = [{ batch_id, qty_allocated }, ...]
  let remaining = qty
  const results: any[] = []

  for (const a of allocations as any[]) {
    if (remaining <= 0) break
    const take = Math.min(Number(a.qty_allocated), remaining)

    // Get current qty_available for batch
    const { data: batchRows, error: fetchErr } = await supabaseAdmin
      .from('inventory_batches')
      .select('id, qty_available')
      .eq('id', a.batch_id)
      .limit(1)
      .single() as any
    if (fetchErr) throw fetchErr

    const beforeQty = Number(batchRows.qty_available || 0)
    const afterQty = beforeQty - take

    // Update batch qty_available
    const { error: updErr } = await supabaseAdmin
      .from('inventory_batches')
      .update({ qty_available: afterQty })
      .eq('id', a.batch_id)
    if (updErr) throw updErr

    // Insert stock movement record
    const { error: mvErr } = await supabaseAdmin
      .from('stock_movements')
      .insert([{ item_id: itemId, batch_id: a.batch_id, type: 'sale', reference_id: null, qty: take, before_qty: beforeQty, after_qty: afterQty, created_by: userId }])
    if (mvErr) throw mvErr

    results.push({ batch_id: a.batch_id, qty: take, before: beforeQty, after: afterQty })
    remaining -= take
  }

  if (remaining > 0) {
    return { success: false, message: 'Partially fulfilled', remaining }
  }

  return { success: true, allocations: results }
}

export async function createAdjustment(userId: string, outletId: string, reason: string, items: Array<any>) {
  // Create adjustment header
  const { data: adj, error: adjErr } = await supabaseAdmin.from('stock_adjustments').insert([{ outlet_id: outletId, reason, created_by: userId }]).select('*').single() as any
  if (adjErr) throw adjErr

  const adjustmentId = adj.id
  // Insert items and update batches
  for (const it of items) {
    const { item_id, batch_id, qty } = it
    await supabaseAdmin.from('stock_adjustment_items').insert([{ adjustment_id: adjustmentId, item_id, batch_id, qty }])

    if (batch_id) {
      // fetch batch current
      const { data: batch, error: bErr } = await supabaseAdmin.from('inventory_batches').select('qty_available').eq('id', batch_id).limit(1).single() as any
      if (bErr) throw bErr
      const beforeQty = Number(batch.qty_available || 0)
      const afterQty = beforeQty + Number(qty)
      const { error: updErr } = await supabaseAdmin.from('inventory_batches').update({ qty_available: afterQty }).eq('id', batch_id)
      if (updErr) throw updErr
      await supabaseAdmin.from('stock_movements').insert([{ item_id, batch_id, type: 'adjustment', reference_id: adjustmentId, qty: qty, before_qty: beforeQty, after_qty: afterQty, reason, created_by: userId }])
    }
  }

  return { success: true, adjustment_id: adjustmentId }
}
