import { db } from './db';
import { API_BASE } from './config';
import { getSupabase, getTenantAuthHeaders } from './supabaseService';

export interface InvoiceBackfillOptions {
  beforeDate?: string;
  onlyMissingItems: boolean;
  dryRun: boolean;
  singleInvoiceId?: string;
  selectedInvoiceIds?: string[];
  concurrency?: number;
  onProgress?: (progress: InvoiceBackfillProgress) => void;
}

export interface InvoiceBackfillCandidate {
  invoice_id: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  outlet_id?: string | null;
  item_count: number;
  local_sync_status?: string | null;
}

export interface InvoiceBackfillProgress {
  total: number;
  processed: number;
  success: number;
  failed: number;
  skipped: number;
  logs: InvoiceBackfillLog[];
  running: boolean;
}

export interface InvoiceBackfillLog {
  invoice_id: string;
  items_synced: number;
  status: 'success' | 'failed' | 'skipped' | 'dry_run';
  error?: string;
}

const emptyProgress = (): InvoiceBackfillProgress => ({
  total: 0,
  processed: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  logs: [],
  running: false,
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const asArray = (value: any): any[] => Array.isArray(value) ? value : [];

const toIsoDateTime = (value: any) => {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const asUuid = (value: any) => {
  const text = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
};

async function deterministicUuid(input: string) {
  const encoded = new TextEncoder().encode(input);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function normalizeItems(invoice: any, rawItems: any[]) {
  const sourceItems = rawItems.length ? rawItems : asArray(invoice?.items);

  return Promise.all(sourceItems.map(async (item, index) => {
    const menuItemId = asUuid(item.menu_item_id) || asUuid(item.product_id) || asUuid(item.item_id) || asUuid(item.id);
    const lineId = item.id && item.invoice_id
      ? item.id
      : await deterministicUuid(`${invoice.id}:${index}:${menuItemId || ''}:${item.name || ''}`);

    return {
      id: lineId,
      invoice_id: invoice.id,
      menu_item_id: menuItemId || null,
      product_id: asUuid(item.product_id) || menuItemId || null,
      name: item.name || null,
      quantity: Number(item.quantity ?? item.qty ?? 0),
      qty: Number(item.qty ?? item.quantity ?? 0),
      price: Number(item.price ?? item.unit_price ?? item.total_amount ?? item.taxable_value ?? 0),
      taxable_value: Number(item.taxable_value ?? item.subtotal ?? item.price ?? 0),
      cgst_amount: Number(item.cgst_amount ?? 0),
      sgst_amount: Number(item.sgst_amount ?? 0),
      igst_amount: Number(item.igst_amount ?? 0),
      total_amount: Number(item.total_amount ?? item.amount ?? item.taxable_value ?? item.price ?? 0),
      discount_amount: Number(item.discount_amount ?? 0),
      selected_modifiers: asArray(item.selected_modifiers),
      applied_promotions: asArray(item.applied_promotions),
      company_id: item.company_id || invoice.company_id,
      outlet_id: item.outlet_id || invoice.outlet_id,
      sync_status: 'synced',
      updated_at: toIsoDateTime(item.updated_at || item.created_at),
      created_at: toIsoDateTime(item.created_at || invoice.created_at || invoice.invoice_date),
    };
  }));
}

async function getLocalInvoiceItems(invoice: any) {
  const tableItems = await db.invoice_items.where('invoice_id').equals(invoice.id).toArray();
  return normalizeItems(invoice, tableItems);
}

async function fetchMissingServerInvoiceIds(invoiceIds: string[]) {
  if (!invoiceIds.length) return new Set<string>();

  const client = getSupabase();
  const [invoicesResult, itemsResult] = await Promise.all([
    client.from('invoices').select('id').in('id', invoiceIds),
    client.from('invoice_items').select('id,invoice_id').in('invoice_id', invoiceIds),
  ]);

  if (invoicesResult.error) throw new Error(invoicesResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);

  const serverInvoiceIds = new Set((invoicesResult.data || []).map((row: any) => row.id));
  const serverItemInvoiceIds = new Set((itemsResult.data || []).map((row: any) => row.invoice_id));

  return new Set(invoiceIds.filter(id => serverInvoiceIds.has(id) && !serverItemInvoiceIds.has(id)));
}

async function findCandidateInvoices(options: InvoiceBackfillOptions) {
  let invoices = await db.invoices.toArray();

  if (options.singleInvoiceId?.trim()) {
    invoices = invoices.filter((invoice: any) => invoice.id === options.singleInvoiceId?.trim());
  }

  if (options.beforeDate) {
    const cutoff = new Date(options.beforeDate);
    invoices = invoices.filter((invoice: any) => {
      const value = invoice.invoice_date || invoice.created_at;
      const invoiceDate = value ? new Date(value) : null;
      return invoiceDate && !Number.isNaN(invoiceDate.getTime()) && invoiceDate < cutoff;
    });
  }

  const withItems = [];
  for (const invoice of invoices) {
    const items = await getLocalInvoiceItems(invoice);
    if (items.length > 0) {
      withItems.push({ invoice, items });
    }
  }

  if (!options.onlyMissingItems) return withItems;

  const missingServerIds = await fetchMissingServerInvoiceIds(withItems.map(row => row.invoice.id));
  return withItems.filter(row => missingServerIds.has(row.invoice.id));
}

function applySelection(candidates: { invoice: any; items: any[] }[], selectedInvoiceIds?: string[]) {
  if (!selectedInvoiceIds || selectedInvoiceIds.length === 0) return candidates;
  const selected = new Set(selectedInvoiceIds);
  return candidates.filter(row => selected.has(row.invoice.id));
}

function toCandidateRow(row: { invoice: any; items: any[] }): InvoiceBackfillCandidate {
  return {
    invoice_id: row.invoice.id,
    invoice_number: row.invoice.invoice_number || null,
    invoice_date: row.invoice.invoice_date || row.invoice.created_at || null,
    outlet_id: row.invoice.outlet_id || null,
    item_count: row.items.length,
    local_sync_status: row.invoice.sync_status || null,
  };
}

async function postInvoiceItems(invoiceId: string, items: any[]) {
  const headers = await getTenantAuthHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch(`${API_BASE}/api/admin/resync-invoice-items`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ invoice_id: invoiceId, items }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error || `HTTP ${response.status}`);
  }

  return result;
}

async function postWithRetry(invoiceId: string, items: any[], attempts = 3) {
  let lastError: any;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await postInvoiceItems(invoiceId, items);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(500 * attempt);
    }
  }
  throw lastError;
}

export const invoiceBackfillService = {
  async preview(options: InvoiceBackfillOptions) {
    const candidates = await findCandidateInvoices(options);
    const invoices = candidates.map(toCandidateRow);
    return {
      total: candidates.length,
      totalItems: candidates.reduce((sum, row) => sum + row.items.length, 0),
      invoices,
    };
  },

  async run(options: InvoiceBackfillOptions) {
    const candidates = applySelection(await findCandidateInvoices(options), options.selectedInvoiceIds);
    const progress = emptyProgress();
    progress.total = candidates.length;
    progress.running = true;
    options.onProgress?.({ ...progress, logs: [...progress.logs] });

    const workerCount = Math.max(1, Math.min(options.concurrency || 10, 10));
    let cursor = 0;

    const recordLog = (log: InvoiceBackfillLog) => {
      progress.logs = [log, ...progress.logs].slice(0, 50);
      progress.processed += 1;
      if (log.status === 'success' || log.status === 'dry_run') progress.success += 1;
      if (log.status === 'failed') progress.failed += 1;
      if (log.status === 'skipped') progress.skipped += 1;
      options.onProgress?.({ ...progress, logs: [...progress.logs] });
    };

    const worker = async () => {
      while (cursor < candidates.length) {
        const current = candidates[cursor];
        cursor += 1;

        if (!current.items.length) {
          recordLog({ invoice_id: current.invoice.id, items_synced: 0, status: 'skipped', error: 'No local items found' });
          continue;
        }

        if (options.dryRun) {
          recordLog({ invoice_id: current.invoice.id, items_synced: current.items.length, status: 'dry_run' });
          continue;
        }

        try {
          await postWithRetry(current.invoice.id, current.items);
          await db.invoice_items.bulkPut(current.items.map(item => ({ ...item, sync_status: 'synced', synced: true, updated_at: new Date().toISOString() })));
          recordLog({ invoice_id: current.invoice.id, items_synced: current.items.length, status: 'success' });
        } catch (error: any) {
          recordLog({ invoice_id: current.invoice.id, items_synced: current.items.length, status: 'failed', error: error.message || String(error) });
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, worker));
    progress.running = false;
    options.onProgress?.({ ...progress, logs: [...progress.logs] });
    return progress;
  },
};
