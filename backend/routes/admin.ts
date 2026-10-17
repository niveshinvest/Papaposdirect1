import express from "express"
import { runCentralAI } from "../services/aiControlPlane"
import { supabaseAdmin } from "../lib/supabaseAdmin"

const router = express.Router()

function hasBackfillAccess(user: any) {
  const role = String(user?.role || "").toUpperCase()
  const permissions = user?.permissions || {}
  return role === "OWNER" || permissions.all === true || permissions.manage_orders === true
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asUuid(value: unknown) {
  const text = String(value || "")
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
}

function normalizeItem(invoiceId: string, item: any) {
  const productId = asUuid(item.product_id)
  const menuItemId = asUuid(item.menu_item_id) || productId

  return {
    id: item.id,
    invoice_id: invoiceId,
    menu_item_id: menuItemId,
    product_id: productId || menuItemId,
    quantity: toNumber(item.quantity ?? item.qty),
    qty: toNumber(item.qty ?? item.quantity),
    price: toNumber(item.price ?? item.unit_price ?? item.total_amount ?? item.taxable_value),
    taxable_value: toNumber(item.taxable_value ?? item.subtotal ?? item.price),
    cgst_amount: toNumber(item.cgst_amount),
    sgst_amount: toNumber(item.sgst_amount),
    igst_amount: toNumber(item.igst_amount),
    total_amount: toNumber(item.total_amount ?? item.amount ?? item.taxable_value ?? item.price),
    discount_amount: toNumber(item.discount_amount),
    selected_modifiers: Array.isArray(item.selected_modifiers) ? item.selected_modifiers : [],
    applied_promotions: Array.isArray(item.applied_promotions) ? item.applied_promotions : [],
  }
}

router.post("/generate", async (req, res) => {
  try {
    const response = await runCentralAI({
      ...req.body,
      company_id: req.user?.company_id || req.body?.company_id,
      outlet_id: req.body?.outlet_id || req.user?.outlet_id || null,
    })

    if (response.error) {
      return res.status(400).json(response)
    }

    res.json(response)

  } catch (error:any) {
    res.status(500).json({
      error: error.message
    })
  }
})

router.post("/resync-invoice-items", async (req, res) => {
  const invoiceId = String(req.body?.invoice_id || "").trim()
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : []

  if (!hasBackfillAccess(req.user)) {
    return res.status(403).json({ error: "Owner or manage_orders permission required" })
  }

  if (!invoiceId) {
    return res.status(400).json({ error: "invoice_id is required" })
  }

  if (!rawItems.length) {
    console.log("[ADMIN_RESYNC_INVOICE_ITEMS] skipped", { invoice_id: invoiceId, items: 0 })
    return res.status(400).json({ error: "items are required" })
  }

  try {
    const companyId = req.user?.company_id
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, company_id, outlet_id")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (invoiceError) throw invoiceError
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found for this company" })
    }

    const items = rawItems.map((item: any) => normalizeItem(invoiceId, item)).filter((item: any) => item.id)

    if (!items.length) {
      return res.status(400).json({ error: "items must include stable ids" })
    }

    const { data, error } = await supabaseAdmin.rpc("admin_resync_invoice_items", {
      p_invoice_id: invoiceId,
      p_items: items,
    }) as any

    if (error) throw error

    console.log("[ADMIN_RESYNC_INVOICE_ITEMS] success", {
      invoice_id: invoiceId,
      items_synced: items.length,
    })

    res.json({
      success: true,
      invoice_id: invoiceId,
      items_synced: data?.items_synced ?? items.length,
    })
  } catch (error: any) {
    console.error("[ADMIN_RESYNC_INVOICE_ITEMS] failed", {
      invoice_id: invoiceId,
      items: rawItems.length,
      error: error.message || error,
    })
    res.status(400).json({ error: error.message || "Failed to resync invoice items" })
  }
})

export default router
