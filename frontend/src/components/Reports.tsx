
import React, { useState, useEffect, useMemo } from 'react';
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { Order, MenuItem, Invoice } from '../types';
import { 
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, 
  Target, ArrowUpRight, Award, PieChart as PieChartIcon, 
  Calendar, Download, Loader2, Filter, FileText, Search
} from 'lucide-react';
import { analyticsService } from '../services/analyticsService';
import { salesService } from '../services/salesService';
import { promotionService } from '../services/promotionService';
import { analyticsAIService, RestaurantAnalyticsAnswer } from '../services/analyticsAIService';
import { aiActionBus } from '../services/aiActionBus';
import { authService, getSupabase } from '../services/supabaseService';
import { printerService } from '../services/printerService';
import * as XLSX from 'xlsx';
import { Edit3, X as CloseIcon, Plus, Trash2, Save, History, Printer } from 'lucide-react';

const Reports: React.FC<{ activeOutletId?: string | null }> = ({ activeOutletId }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [originalEditingInvoice, setOriginalEditingInvoice] = useState<any>(null);
  const [editReason, setEditReason] = useState('');
  const [currentProfile, setCurrentProfile] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [historyInvoice, setHistoryInvoice] = useState<any>(null);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [lastEditedInvoice, setLastEditedInvoice] = useState<any>(null);
  const [saleMenuItems, setSaleMenuItems] = useState<MenuItem[]>([]);
  const [selectedAddItemId, setSelectedAddItemId] = useState('');
  const [promotionUsage, setPromotionUsage] = useState<any[]>([]);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<RestaurantAnalyticsAnswer | null>(null);
  const [dateRange, setDateRange] = useState({ 
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const suggestedQuestions = [
    'Why sales dropped yesterday?',
    'Show slow items',
    'What should I promote this week?',
    'Which hours are weak?',
    'Which items have low margin?',
  ];
  const quickReports = [
    { group: 'Sales', items: ['Hourly Sales', 'Daily Sales', 'Sales by Item', 'Sales by Category', 'Sales by Staff', 'Peak Hour Analysis', 'Slow Hour Detection'] },
    { group: 'Menu', items: ['Top Selling Items', 'Slow Selling Items', 'High Profit Items', 'Low Margin Items', 'Combo Opportunities'] },
    { group: 'Inventory', items: ['Consumption Analysis', 'Wastage Detection', 'Low Stock Alert', 'Dead Stock Detection'] },
    { group: 'Customer', items: ['Repeat Customer Rate', 'Average Order Value', 'Customer Favorite Items', 'Visit Pattern'] },
    { group: 'Financial', items: ['Payment Mode Analysis', 'Discount Report', 'Profit Report', 'Refund Report'] },
  ];

  useEffect(() => {
    loadReport();
  }, [activeOutletId, dateRange]);

  useEffect(() => {
    authService.getProfile().then(setCurrentProfile).catch(() => setCurrentProfile(null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSaleMenuItems = async () => {
      if (!activeOutletId) {
        setSaleMenuItems([]);
        return;
      }

      try {
        const client = getSupabase();
        const { data: profile } = await client.auth.getUser();
        if (!profile?.user) return;

        const { data: rows, error } = await client
          .from('menu_items')
          .select('id,name,base_price,tax_percentage,price_includes_tax,hsn_code')
          .eq('outlet_id', activeOutletId)
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        if (!cancelled) setSaleMenuItems((rows || []) as MenuItem[]);
      } catch (error) {
        console.warn('Sale edit menu lookup failed:', error);
        if (!cancelled) setSaleMenuItems([]);
      }
    };

    loadSaleMenuItems();
    return () => {
      cancelled = true;
    };
  }, [activeOutletId]);

  useEffect(() => {
    const runPendingAction = async (question: string) => {
      if (!question) return;
      setAiQuestion(question);
      await handleAskAI(question);
    };

    const pending = aiActionBus.consumePending('REPORTS' as any);
    if (pending?.type === 'RUN_REPORT') {
      void runPendingAction(pending.payload.question);
    }

    return aiActionBus.subscribe((action) => {
      if (action.targetView === 'REPORTS' && action.type === 'RUN_REPORT') {
        void runPendingAction(action.payload.question);
      }
    });
  }, [activeOutletId, dateRange.start, dateRange.end]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const startDate = `${dateRange.start}T00:00:00.000Z`;
      const endDate = `${dateRange.end}T23:59:59.999Z`;
      const [stats, usage] = await Promise.all([
        analyticsService.getFullSalesReport({
          outletId: activeOutletId,
          startDate,
          endDate
        }),
        promotionService.fetchPromotionUsage(activeOutletId, startDate, endDate)
      ]);
      setData(stats);
      setPromotionUsage(usage);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const can = (permission: string) =>
    Boolean(currentProfile?.permissions?.all || currentProfile?.permissions?.[permission] || currentProfile?.is_owner);

  const loadSaleMenuItemsForOutlet = async (outletId?: string | null) => {
    if (!outletId) {
      setSaleMenuItems([]);
      return;
    }

    try {
      const client = getSupabase();
      const { data: rows, error } = await client
        .from('menu_items')
        .select('id,name,base_price,price,tax_percentage,price_includes_tax,hsn_code')
        .eq('outlet_id', outletId)
        .eq('available', true)
        .order('name');

      if (error) throw error;
      setSaleMenuItems((rows || []) as MenuItem[]);
    } catch (error) {
      console.warn('Sale edit menu lookup failed:', error);
      setSaleMenuItems([]);
    }
  };

  const handleExport = () => {
    if (data.length === 0) return alert("No data to export");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
    XLSX.writeFile(wb, `Sales_Report_${dateRange.start}_to_${dateRange.end}.xlsx`);
  };

  const handleExportAIExcel = () => {
    if (!aiReport) return alert("Generate an AI report first.");

    const rows = [
      { section: 'Report Type', value: aiReport.report_type },
      { section: 'Summary', value: aiReport.summary },
      ...aiReport.key_findings.map((value, index) => ({ section: `Key Finding ${index + 1}`, value })),
      { section: 'Business Insight', value: aiReport.business_insight },
      ...aiReport.actionable_suggestions.map((value, index) => ({ section: `Actionable Suggestion ${index + 1}`, value })),
      ...((aiReport.supporting_metrics || []).map((value, index) => ({ section: `Supporting Metric ${index + 1}`, value }))),
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AI Report");
    XLSX.writeFile(wb, `PapaPOS_AI_Report_${dateRange.start}_to_${dateRange.end}.xlsx`);
  };

  const handleExportAIPdf = () => {
    if (!aiReport) return alert("Generate an AI report first.");

    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) {
      alert('Unable to open print window for PDF export.');
      return;
    }

    const renderList = (items: string[]) => items.length
      ? `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`
      : '<p>No data available.</p>';

    const html = `
      <html>
        <head>
          <title>PapaPOS AI Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }
            h1 { margin: 0 0 8px 0; font-size: 28px; }
            h2 { margin: 28px 0 10px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; }
            .meta { color: #64748b; font-size: 12px; margin-bottom: 24px; }
            .hero { background: #0f172a; color: white; border-radius: 20px; padding: 24px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 18px; padding: 18px; margin-top: 16px; }
            ul { margin: 0; padding-left: 18px; }
            li { margin: 8px 0; }
            p { line-height: 1.6; margin: 0; }
            @media print { body { margin: 18px; } }
          </style>
        </head>
        <body>
          <div class="hero">
            <h1>PapaPOS AI Report</h1>
            <div class="meta">Date Range: ${dateRange.start} to ${dateRange.end} | Report Type: ${aiReport.report_type.replace(/_/g, ' ')}</div>
            <p>${aiReport.summary}</p>
          </div>

          <h2>Key Findings</h2>
          <div class="card">${renderList(aiReport.key_findings)}</div>

          <h2>Business Insight</h2>
          <div class="card"><p>${aiReport.business_insight}</p></div>

          <h2>Actionable Suggestions</h2>
          <div class="card">${renderList(aiReport.actionable_suggestions)}</div>

          <h2>Supporting Metrics</h2>
          <div class="card">${renderList(aiReport.supporting_metrics || [])}</div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  const handleAskAI = async (questionOverride?: string) => {
    const question = (questionOverride || aiQuestion).trim();
    if (!question) return alert('Enter a report question first.');

    setAiLoading(true);
    try {
      const report = await analyticsAIService.generateReport(question, {
        outletId: activeOutletId,
        startDate: `${dateRange.start}T00:00:00.000Z`,
        endDate: `${dateRange.end}T23:59:59.999Z`
      });
      setAiQuestion(question);
      setAiReport(report);
    } catch (e: any) {
      alert(`AI report failed: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const startEdit = async (invoiceId: string) => {
    if (!can('sale.edit')) return alert('You do not have permission to edit sales.');
    setLoading(true);
    try {
      const inv = await salesService.getInvoiceWithItems(invoiceId);
      await loadSaleMenuItemsForOutlet(inv.outlet_id || activeOutletId);
      setEditingInvoice(inv);
      setOriginalEditingInvoice(JSON.parse(JSON.stringify(inv)));
      setLastEditedInvoice(null);
    } catch (e) {
      alert("Failed to load invoice details");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!can('sale.edit')) return alert('You do not have permission to edit sales.');
    if (!editReason.trim()) return alert("Please provide a reason for editing");
    setLoading(true);
    try {
      const result: any = await salesService.editInvoice({
        invoiceId: editingInvoice.id,
        newSubtotal: editingInvoice.subtotal,
        newTotalTax: editingInvoice.total_tax,
        newGrandTotal: editingInvoice.grand_total,
        newItems: editingInvoice.invoice_items,
        editReason: editReason.trim()
      });
      const updated = {
        ...editingInvoice,
        ...(result?.invoice || {}),
        invoice_items: result?.items || editingInvoice.invoice_items,
        items: result?.items || editingInvoice.invoice_items,
        print_label: 'UPDATED INVOICE'
      };
      setLastEditedInvoice(updated);
      setEditingInvoice(null);
      setEditReason('');
      await loadReport();
      alert('Sale updated. Audit log captured.');
    } catch (e: any) {
      alert(`Failed to save: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const parseNumber = (value: any, fallback = 0) => {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  };

  const recalculateLine = (item: any, updates: any = {}) => {
    const next = { ...item, ...updates };
    const quantity = Math.max(0, parseNumber(next.quantity ?? next.qty));
    const unitPrice = Math.max(0, parseNumber(next.unit_price ?? next.price));
    const rate = Math.max(0, parseNumber(next.tax_percentage ?? next.tax_rate));
    const taxable = Number((unitPrice * quantity).toFixed(4));
    const totalTax = Number(((taxable * rate) / 100).toFixed(2));
    const isIgst = parseNumber(next.igst_amount) > 0 && parseNumber(next.cgst_amount) === 0 && parseNumber(next.sgst_amount) === 0;
    const cgst = isIgst ? 0 : Number((totalTax / 2).toFixed(2));
    const sgst = isIgst ? 0 : Number((totalTax / 2).toFixed(2));
    const igst = isIgst ? totalTax : 0;

    return {
      ...next,
      name: next.name || next.item_name || 'Item',
      item_name: next.item_name || next.name || 'Item',
      quantity,
      unit_price: unitPrice,
      price: unitPrice,
      tax_percentage: rate,
      taxable_value: taxable,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      tax_amount: totalTax,
      total_amount: Number((taxable + totalTax).toFixed(2)),
    };
  };

  const recalculateInvoice = (invoice: any, items: any[]) => {
    const subtotal = items.reduce((acc, it) => acc + parseNumber(it.taxable_value), 0);
    const totalTax = items.reduce((acc, it) => acc + parseNumber(it.cgst_amount) + parseNumber(it.sgst_amount) + parseNumber(it.igst_amount), 0);
    const lineTotal = items.reduce((acc, it) => acc + parseNumber(it.total_amount), 0);
    const grandTotal = Math.round(lineTotal);
    return {
      ...invoice,
      invoice_items: items,
      subtotal,
      taxable_value: subtotal,
      total_tax: totalTax,
      grand_total: grandTotal,
      round_off: grandTotal - lineTotal,
    };
  };

  const updateItem = (idx: number, updates: any) => {
    const newItems = [...editingInvoice.invoice_items];
    newItems[idx] = recalculateLine(newItems[idx], updates);
    setEditingInvoice(recalculateInvoice(editingInvoice, newItems));
  };

  const addEditItem = () => {
    const selectedMenuItem = saleMenuItems.find(item => item.id === selectedAddItemId);
    if (!selectedMenuItem) return alert('Select a menu item to add.');

    const newItem = recalculateLine({
      id: crypto.randomUUID(),
      menu_item_id: selectedMenuItem.id,
      name: selectedMenuItem.name,
      item_name: selectedMenuItem.name,
      quantity: 1,
      unit_price: Number(selectedMenuItem.base_price ?? selectedMenuItem.price ?? 0),
      tax_percentage: Number(selectedMenuItem.tax_percentage ?? selectedMenuItem.gst_rate ?? 0),
      selected_modifiers: [],
      applied_promotions: [],
    });
    setEditingInvoice(recalculateInvoice(editingInvoice, [...editingInvoice.invoice_items, newItem]));
    setSelectedAddItemId('');
  };

  const removeEditItem = (idx: number) => {
    const newItems = editingInvoice.invoice_items.filter((_: any, itemIdx: number) => itemIdx !== idx);
    setEditingInvoice(recalculateInvoice(editingInvoice, newItems));
  };

  const itemKey = (item: any) => String(item?.id || item?.menu_item_id || item?.item_id || item?.name || item?.item_name || '');

  const getOriginalItem = (item: any) =>
    originalEditingInvoice?.invoice_items?.find((oldItem: any) => itemKey(oldItem) === itemKey(item));

  const getItemChangeState = (item: any) => {
    const original = getOriginalItem(item);
    if (!original) return 'added';
    const qtyChanged = parseNumber(original.quantity ?? original.qty) !== parseNumber(item.quantity ?? item.qty);
    const priceChanged = parseNumber(original.unit_price ?? original.price) !== parseNumber(item.unit_price ?? item.price);
    const totalChanged = parseNumber(original.total_amount ?? original.total_price) !== parseNumber(item.total_amount ?? item.total_price);
    return qtyChanged || priceChanged || totalChanged ? 'updated' : 'same';
  };

  const buildDeltaKotItems = (oldInvoice: any, newInvoice: any) => {
    const oldItems = oldInvoice?.invoice_items || [];
    return (newInvoice?.invoice_items || newInvoice?.items || [])
      .map((item: any) => {
        const oldItem = oldItems.find((old: any) => itemKey(old) === itemKey(item));
        const oldQty = parseNumber(oldItem?.quantity ?? oldItem?.qty);
        const newQty = parseNumber(item.quantity ?? item.qty);
        const deltaQty = oldItem ? newQty - oldQty : newQty;
        return { ...item, quantity: deltaQty, name: item.name || item.item_name };
      })
      .filter((item: any) => item.quantity > 0);
  };

  const handleDeleteInvoice = async () => {
    if (!deleteTarget) return;
    if (!can('sale.delete')) return alert('You do not have permission to delete sales.');
    if (!deleteReason.trim()) return alert('Please provide a reason for deletion');

    setLoading(true);
    try {
      await salesService.deleteInvoice(deleteTarget.id, deleteReason.trim());
      setDeleteTarget(null);
      setDeleteReason('');
      await loadReport();
      alert('Sale deleted safely. Original data remains in audit history.');
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openHistory = async (invoice: any) => {
    setHistoryInvoice(invoice);
    setAuditLoading(true);
    try {
      setAuditHistory(await salesService.getSaleAuditHistory(invoice.id));
    } catch (e: any) {
      alert(`Failed to load history: ${e.message}`);
      setAuditHistory([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const printUpdatedInvoice = async () => {
    if (!lastEditedInvoice) return;
    await printerService.printInvoice({
      ...lastEditedInvoice,
      items: lastEditedInvoice.invoice_items || lastEditedInvoice.items || [],
      print_label: 'UPDATED INVOICE',
    }, { silent: false, paperSize: '80mm' });
  };

  const printDeltaKot = async () => {
    if (!lastEditedInvoice || !originalEditingInvoice) return;
    const items = buildDeltaKotItems(originalEditingInvoice, lastEditedInvoice);
    if (items.length === 0) return alert('No new or increased quantity items for KOT.');
    await printerService.printKOT({
      order_id: lastEditedInvoice.order_id || lastEditedInvoice.id,
      table_name: lastEditedInvoice.tableId || 'Updated Sale',
      created_at: new Date().toISOString(),
      staff_name: currentProfile?.full_name || 'Counter',
      items,
      title: 'UPDATED KOT DELTA',
    }, { silent: false, paperSize: '80mm' });
  };

  const describeAuditChange = (entry: any) => {
    const changes = entry?.changed_fields || {};
    if (entry?.action_type === 'DELETE') return ['Sale marked deleted'];

    const lines: string[] = [];
    (changes.items_added || []).forEach((item: any) => {
      lines.push(`Added ${item.name || item.item_name || 'Item'} x ${item.quantity || item.qty || 0}`);
    });
    (changes.items_removed || []).forEach((item: any) => {
      lines.push(`Removed ${item.name || item.item_name || 'Item'} x ${item.quantity || item.qty || 0}`);
    });
    (changes.items_updated || []).forEach((item: any) => {
      const name = item.item_name || item.name || 'Item';
      if (Number(item.old_qty) !== Number(item.new_qty)) lines.push(`${name} qty: ${item.old_qty} -> ${item.new_qty}`);
      if (Number(item.old_price) !== Number(item.new_price)) lines.push(`${name} price: ${item.old_price} -> ${item.new_price}`);
    });
    if (Number(changes.total_old) !== Number(changes.total_new)) {
      lines.push(`Total: ${changes.total_old} -> ${changes.total_new}`);
    }
    return lines.length ? lines : ['Invoice metadata updated'];
  };

  const stats = useMemo(() => {
    const totalSales = data.reduce((acc, curr) => acc + Number(curr.subtotal), 0);
    const totalTax = data.reduce((acc, curr) => acc + Number(curr.total_tax), 0);
    const discountValue = data.reduce((acc, curr) => acc + Number(curr.discount_total || 0), 0);
    const savingsValue = data.reduce((acc, curr) => acc + Number(curr.savings_total || 0), 0);
    const promoBills = data.filter(curr => Number(curr.discount_total || 0) > 0 || (curr.promotion_summary || []).length > 0).length;
    return { totalSales, totalTax, count: data.length, discountValue, savingsValue, promoBills };
  }, [data]);

  const promoBreakdown = useMemo(() => {
    const buckets = new Map<string, { name: string; usage_count: number; savings_amount: number; revenue_impact: number }>();
    promotionUsage.forEach((row: any) => {
      const key = row.source_name || 'Unnamed';
      const current = buckets.get(key) || { name: key, usage_count: 0, savings_amount: 0, revenue_impact: 0 };
      current.usage_count += Number(row.usage_count || 1);
      current.savings_amount += Number(row.savings_amount || row.amount || 0);
      current.revenue_impact += Number(row.revenue_impact || 0);
      buckets.set(key, current);
    });
    data.forEach((invoice: any) => {
      const promotions = Array.isArray(invoice.promotion_summary) ? invoice.promotion_summary : [];
      promotions.forEach((row: any) => {
        const key = row.name || 'Unnamed';
        const current = buckets.get(key) || { name: key, usage_count: 0, savings_amount: 0, revenue_impact: 0 };
        current.usage_count += 1;
        current.savings_amount += Number(row.amount || 0);
        current.revenue_impact += Number(invoice.grand_total || 0);
        buckets.set(key, current);
      });
    });
    return Array.from(buckets.values()).sort((left, right) => right.usage_count - left.usage_count).slice(0, 8);
  }, [promotionUsage, data]);

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500 pb-32 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Business Ledger</h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Direct Database Audit</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
             <input type="date" className="p-2 text-xs font-black outline-none border-none bg-transparent" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
             <span className="flex items-center text-slate-300">|</span>
             <input type="date" className="p-2 text-xs font-black outline-none border-none bg-transparent" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
          </div>
          <button onClick={handleExport} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:scale-105 transition-all text-xs uppercase tracking-widest">
            <Download size={18} /> Export Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Period Sales</p>
           <h3 className="text-3xl font-black text-slate-900 mt-2">₹{stats.totalSales.toLocaleString()}</h3>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tax Collected</p>
           <h3 className="text-3xl font-black text-emerald-600 mt-2">₹{stats.totalTax.toLocaleString()}</h3>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bills Finalized</p>
           <h3 className="text-3xl font-black text-indigo-600 mt-2">{stats.count}</h3>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Discount Given</p>
           <h3 className="text-3xl font-black text-rose-500 mt-2">₹{stats.discountValue.toLocaleString()}</h3>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Promo Bills</p>
           <h3 className="text-3xl font-black text-orange-500 mt-2">{stats.promoBills}</h3>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div>
            <h3 className="text-xl font-black text-slate-900">Ask PapaPOS AI</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Restaurant business consultant for sales, menu, inventory, customer, and finance intelligence</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map(question => (
              <button
                key={question}
                onClick={() => handleAskAI(question)}
                className="px-4 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-all"
              >
                {question}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-4">
          <textarea
            value={aiQuestion}
            onChange={e => setAiQuestion(e.target.value)}
            placeholder="Ask things like: Why sales dropped yesterday, show slow items, what should I promote, which payment mode is dominating..."
            className="flex-1 min-h-[110px] rounded-[28px] bg-slate-50 border border-slate-200 px-5 py-4 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <button
            onClick={() => handleAskAI()}
            disabled={aiLoading}
            className="xl:w-56 px-8 py-5 rounded-[28px] bg-slate-900 text-white font-black uppercase tracking-widest text-xs shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {aiLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            Generate Report
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quick Reports</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Tap a preset to generate a focused report instantly.</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {quickReports.map(section => (
              <div key={section.group} className="rounded-[28px] border border-slate-100 bg-slate-50 p-5 space-y-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{section.group} Intelligence</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {section.items.map(item => (
                    <button
                      key={item}
                      onClick={() => handleAskAI(`Generate a ${item} report with business insight and actionable suggestions.`)}
                      className="px-4 py-2 rounded-2xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:border-orange-300 hover:text-orange-600 transition-all"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {aiReport && (
          <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-6">
            <div className="rounded-[32px] bg-slate-900 text-white p-7 space-y-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Summary</p>
                <h4 className="text-2xl font-black leading-tight mt-2">{aiReport.summary}</h4>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Business Insight</p>
                <p className="text-sm font-bold text-slate-200 mt-2 leading-relaxed">{aiReport.business_insight}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Report Type</p>
                <p className="text-sm font-black text-orange-400 mt-2">{aiReport.report_type.replace(/_/g, ' ')}</p>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={handleExportAIExcel}
                  className="px-4 py-3 rounded-2xl bg-white text-slate-900 font-black uppercase tracking-widest text-[10px]"
                >
                  Export Excel
                </button>
                <button
                  onClick={handleExportAIPdf}
                  className="px-4 py-3 rounded-2xl bg-orange-500 text-white font-black uppercase tracking-widest text-[10px]"
                >
                  Export PDF
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[32px] border border-slate-100 bg-slate-50 p-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Key Findings</p>
                <div className="space-y-3">
                  {(aiReport.key_findings.length ? aiReport.key_findings : ['No key findings returned.']).map((finding, index) => (
                    <div key={`${finding}-${index}`} className="rounded-2xl bg-white border border-slate-100 px-4 py-3 font-bold text-slate-700">
                      {finding}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-emerald-100 bg-emerald-50 p-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-4">Actionable Suggestions</p>
                <div className="space-y-3">
                  {(aiReport.actionable_suggestions.length ? aiReport.actionable_suggestions : ['No suggestions returned.']).map((suggestion, index) => (
                    <div key={`${suggestion}-${index}`} className="rounded-2xl bg-white/90 border border-emerald-100 px-4 py-3 font-bold text-emerald-900">
                      {suggestion}
                    </div>
                  ))}
                </div>
              </div>

              {aiReport.supporting_metrics && aiReport.supporting_metrics.length > 0 && (
                <div className="rounded-[32px] border border-indigo-100 bg-indigo-50 p-6">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-4">Supporting Metrics</p>
                  <div className="space-y-2">
                    {aiReport.supporting_metrics.map((metric, index) => (
                      <div key={`${metric}-${index}`} className="text-sm font-bold text-indigo-900">{metric}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!loading && (
        <div className="grid xl:grid-cols-[1.2fr_1fr] gap-6">
          <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-8">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-900">Offer Usage Report</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Usage count, savings, revenue impact</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">You Saved</p>
                <p className="text-2xl font-black text-emerald-600">₹{stats.savingsValue.toLocaleString()}</p>
              </div>
            </div>
            {promoBreakdown.length === 0 ? (
              <div className="rounded-[28px] border-2 border-dashed border-slate-100 p-12 text-center text-slate-500 font-bold">
                No promotion usage synced in this date range yet.
              </div>
            ) : (
              <div className="space-y-3">
                {promoBreakdown.map((row, index) => (
                  <div key={row.name} className="grid grid-cols-[1.5fr_repeat(3,1fr)] gap-4 items-center rounded-3xl border border-slate-100 px-5 py-4">
                    <div>
                      <p className="font-black text-slate-900">{row.name}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rank #{index + 1}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Usage</p>
                      <p className="font-black text-indigo-600">{row.usage_count}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Savings</p>
                      <p className="font-black text-emerald-600">₹{row.savings_amount.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Impact</p>
                      <p className="font-black text-orange-500">₹{row.revenue_impact.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-[40px] shadow-sm p-8 text-white">
            <h3 className="text-xl font-black">Combo & Discount Snapshot</h3>
            <div className="space-y-5 mt-8">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Average savings per promo bill</p>
                <p className="text-3xl font-black mt-2">₹{stats.promoBills ? (stats.savingsValue / stats.promoBills).toFixed(2) : '0.00'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Discount as % of sales</p>
                <p className="text-3xl font-black mt-2">{stats.totalSales ? ((stats.discountValue / stats.totalSales) * 100).toFixed(2) : '0.00'}%</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Promotion adoption</p>
                <p className="text-3xl font-black mt-2">{stats.count ? ((stats.promoBills / stats.count) * 100).toFixed(1) : '0.0'}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-96 flex flex-col items-center justify-center space-y-4 bg-white rounded-[40px] border border-slate-100">
           <Loader2 className="animate-spin text-orange-500" size={48} />
           <p className="font-black text-slate-400 uppercase text-[10px]">Scanning Financial Records...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="bg-white p-32 rounded-[60px] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-center space-y-6">
           <FileText size={80} className="text-slate-100" />
           <h3 className="text-2xl font-black text-slate-800">No Transactions in Range</h3>
        </div>
      ) : (
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
           <div className="overflow-x-auto">
              <table className="w-full text-left">
                 <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    <tr>
                       <th className="px-8 py-5">Invoice #</th>
                       <th className="px-8 py-5">Timestamp</th>
                       <th className="px-8 py-5">Payment</th>
                       <th className="px-8 py-5 text-right">Tax</th>
                       <th className="px-8 py-5 text-right">Discount</th>
                       <th className="px-8 py-5 text-right">Total Amount</th>
                       <th className="px-8 py-5 text-right">Grand Total</th>
                       <th className="px-8 py-5 text-right">Actions</th>

                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {data.map((inv, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                         <td className="px-8 py-6 font-black text-slate-800">{inv.invoice_number}</td>
                         <td className="px-8 py-6 text-xs font-bold text-slate-500">{new Date(inv.created_at).toLocaleString()}</td>
                         <td className="px-8 py-6">
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-widest">{inv.payment_method}</span>
                         </td>
                         <td className="px-8 py-6 text-right font-bold text-emerald-600">₹{Number(inv.total_tax).toFixed(2)}</td>
                         <td className="px-8 py-6 text-right font-bold text-rose-500">₹{Number(inv.discount_total || 0).toFixed(2)}</td>
                         <td className="px-8 py-6 text-right font-black text-slate-900">₹{Number(inv.subtotal).toLocaleString()}</td>
                         <td className="px-8 py-6 text-right font-black text-slate-900">₹{Number(inv.grand_total || 0).toLocaleString()}</td>
                         <td className="px-8 py-6 text-right">
                            <div className="flex justify-end gap-2">
                              {can('sale.edit') && (
                                <button
                                  onClick={() => startEdit(inv.id)}
                                  title="Edit Sale"
                                  className="p-2 text-slate-300 hover:text-indigo-600 transition-all"
                                >
                                  <Edit3 size={16} />
                                </button>
                              )}
                              {can('sale.delete') && (
                                <button
                                  onClick={() => setDeleteTarget(inv)}
                                  title="Delete Sale"
                                  className="p-2 text-slate-300 hover:text-rose-600 transition-all"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                              <button
                                onClick={() => openHistory(inv)}
                                title="View History"
                                className="p-2 text-slate-300 hover:text-slate-700 transition-all"
                              >
                                <History size={16} />
                              </button>
                            </div>
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {lastEditedInvoice && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-[32px] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Updated Invoice Ready</p>
            <h3 className="text-lg font-black text-slate-900">Invoice #{lastEditedInvoice.invoice_number}</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={printUpdatedInvoice} className="px-5 py-3 bg-white border border-emerald-200 text-emerald-700 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2">
              <Printer size={16} /> Reprint Invoice
            </button>
            <button onClick={printDeltaKot} className="px-5 py-3 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2">
              <Printer size={16} /> Print KOT Delta
            </button>
          </div>
        </div>
      )}

      {editingInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg"><Edit3 size={20} /></div>
                    <div>
                       <h3 className="text-xl font-black text-slate-900">Edit Invoice #{editingInvoice.invoice_number}</h3>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audit Trail Enabled</p>
                    </div>
                 </div>
                 <button onClick={() => setEditingInvoice(null)} className="p-2 bg-white border rounded-full text-slate-400 hover:text-slate-900 transition-all"><CloseIcon size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-8">
                 <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Line Items</h4>
                    <div className="space-y-3">
                       {editingInvoice.invoice_items.map((item: any, idx: number) => {
                         const changeState = getItemChangeState(item);
                         return (
                         <div
                           key={item.id || idx}
                           className={`flex items-center gap-4 p-4 rounded-2xl border group ${
                             changeState === 'added'
                               ? 'bg-emerald-50 border-emerald-100'
                               : changeState === 'updated'
                                 ? 'bg-amber-50 border-amber-100'
                                 : 'bg-slate-50 border-slate-100'
                           }`}
                         >
                            <div className="flex-1">
                               <p className="font-black text-slate-900">{item.name}</p>
                               <p className="text-[9px] font-black text-slate-400 uppercase">Rate: ₹{item.unit_price}</p>
                            </div>
                            <div className="flex items-center gap-6">
                               <div className="text-right w-20">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Qty</p>
                                  <input 
                                    type="number"
                                    className="w-full bg-transparent border-none font-black text-slate-900 text-right focus:ring-0 p-0"
                                    value={item.quantity}
                                    onChange={e => updateItem(idx, { quantity: Number(e.target.value), total_amount: Number(e.target.value) * item.unit_price })}
                                  />
                               </div>
                               <div className="text-right w-24">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Rate</p>
                                  <input
                                    type="number"
                                    disabled={!can('sale.override_price')}
                                    className="w-full bg-transparent border-none font-black text-slate-900 text-right focus:ring-0 p-0 disabled:text-slate-400"
                                    value={item.unit_price}
                                    onChange={e => updateItem(idx, { unit_price: Number(e.target.value), price: Number(e.target.value) })}
                                  />
                               </div>
                               <div className="text-right w-24">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total</p>
                                  <p className="font-black text-indigo-600">₹{item.total_amount.toFixed(2)}</p>
                               </div>
                               <button
                                 onClick={() => removeEditItem(idx)}
                                 className="p-2 text-slate-300 hover:text-rose-600 transition-all"
                                 title="Remove item"
                               >
                                 <Trash2 size={16} />
                               </button>
                            </div>
                         </div>
                       )})}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <select
                        value={selectedAddItemId}
                        onChange={e => setSelectedAddItemId(e.target.value)}
                        className="flex-1 p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Select menu item to add</option>
                        {saleMenuItems.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.name} - â‚¹{Number(item.base_price ?? item.price ?? 0).toFixed(2)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={addEditItem}
                        className="px-6 py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                      >
                        <Plus size={16} /> Add Item
                      </button>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason for Edit (Required for Audit)</label>
                    <textarea 
                      className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
                      placeholder="e.g., Incorrect quantity entered by staff, Discount applied post-billing..."
                      value={editReason}
                      onChange={e => setEditReason(e.target.value)}
                    />
                 </div>
              </div>

              <div className="p-8 border-t bg-slate-50/50 flex justify-between items-center">
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">New Adjusted Total</p>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter">₹{editingInvoice.grand_total.toLocaleString()}</h3>
                 </div>
                 <div className="flex gap-3">
                    <button onClick={() => setEditingInvoice(null)} className="px-8 py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest">Cancel</button>
                    <button 
                      onClick={handleSaveEdit}
                      disabled={loading || !editReason}
                      className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                    >
                       {loading ? <Loader2 className="animate-spin" size={18} /> : <div className="flex items-center gap-2"><Save size={18} /> Save Changes</div>}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b bg-slate-50/50">
              <h3 className="text-xl font-black text-slate-900">Delete Sale #{deleteTarget.invoice_number}</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Soft delete only. Audit reason is mandatory.</p>
            </div>
            <div className="p-8 space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enter reason for deletion</label>
              <textarea
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 min-h-[110px]"
                placeholder="Reason required for audit trail"
              />
            </div>
            <div className="p-8 border-t bg-slate-50/50 flex justify-end gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeleteReason(''); }} className="px-6 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest">Cancel</button>
              <button onClick={handleDeleteInvoice} disabled={loading || !deleteReason.trim()} className="px-8 py-4 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest disabled:opacity-50">
                Delete Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {historyInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-slate-900">Invoice History #{historyInvoice.invoice_number}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Edit and delete audit timeline</p>
              </div>
              <button onClick={() => setHistoryInvoice(null)} className="p-2 bg-white border rounded-full text-slate-400 hover:text-slate-900 transition-all"><CloseIcon size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-4">
              {auditLoading ? (
                <div className="h-40 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={24} /></div>
              ) : auditHistory.length === 0 ? (
                <div className="rounded-3xl border-2 border-dashed border-slate-100 p-12 text-center font-bold text-slate-400">No sale history yet.</div>
              ) : auditHistory.map(entry => (
                <div key={entry.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <p className="font-black text-slate-900">{new Date(entry.performed_at).toLocaleString()} · {entry.profiles?.full_name || entry.profiles?.email || 'User'} {entry.action_type === 'DELETE' ? 'deleted sale' : 'edited sale'}</p>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{entry.action_type}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-sm font-bold text-slate-600">
                    {describeAuditChange(entry).map((line, idx) => <div key={idx}>- {line}</div>)}
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-500">Reason: {entry.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
