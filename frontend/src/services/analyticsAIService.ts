import { getSupabase, authService } from './supabaseService';
import { universalAIService } from './UniversalAIService';
import { aiService } from './aiService';
import type { ReportParams } from './analyticsService';

export interface RestaurantAnalyticsAnswer {
  report_type: string;
  summary: string;
  key_findings: string[];
  business_insight: string;
  actionable_suggestions: string[];
  supporting_metrics?: string[];
}

const DEFAULT_ANSWER: RestaurantAnalyticsAnswer = {
  report_type: 'GENERAL_ANALYSIS',
  summary: 'Not enough synced data to generate a meaningful report yet.',
  key_findings: ['Sales, menu, inventory, or customer data is missing for the selected range.'],
  business_insight: 'The AI report becomes more accurate after invoices, invoice items, and inventory movements are synced for the outlet.',
  actionable_suggestions: ['Sync recent POS data and try the report again.', 'Use a wider date range if the outlet is newly active.'],
  supporting_metrics: [],
};

const safeJsonParse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const normalizeArray = (value: any) => Array.isArray(value)
  ? value.map(item => String(item)).filter(Boolean)
  : [];

export const analyticsAIService = {
  async generateReport(question: string, params: ReportParams): Promise<RestaurantAnalyticsAnswer> {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) throw new Error('Question is required');

    if (await aiService.checkKillSwitch()) {
      throw new Error('AI services temporarily disabled by administrator.');
    }

    const client = getSupabase();
    const profile = await authService.getProfile();
    if (!profile?.company_id) throw new Error('Authentication required');

    const [
      { data: invoices, error: invoicesError },
      { data: invoiceItems, error: itemsError },
      { data: menuItems, error: menuError },
      { data: recipes, error: recipesError },
      { data: inventoryItems, error: inventoryError },
      { data: inventoryLedger, error: ledgerError },
    ] = await Promise.all([
      client
        .from('invoices')
        .select('id, outlet_id, created_at, grand_total, subtotal, total_tax, payment_method, finalized_by_user_id, buyer_name, buyer_gstin, discount_total, savings_total, promotion_summary')
        .eq('company_id', profile.company_id)
        .gte('created_at', params.startDate)
        .lte('created_at', params.endDate)
        .then(result => result),
      client
        .from('invoice_items')
        .select('menu_item_id, quantity, total_amount, taxable_value, discount_amount, invoices!inner(id, outlet_id, created_at, finalized_by_user_id, payment_method, buyer_name, buyer_gstin)')
        .eq('invoices.company_id', profile.company_id)
        .gte('invoices.created_at', params.startDate)
        .lte('invoices.created_at', params.endDate)
        .then(result => result),
      client
        .from('menu_items')
        .select('id, name, base_price, category_id, menu_categories(name)')
        .eq('company_id', profile.company_id)
        .then(result => result),
      client
        .from('recipes')
        .select('menu_item_id, totalCost')
        .eq('company_id', profile.company_id)
        .then(result => result),
      client
        .from('inventory')
        .select('id, name, category, unit, min_level, cost_price, preferred_vendor, outlet_id')
        .eq('company_id', profile.company_id)
        .then(result => result),
      client
        .from('inventory_ledger')
        .select('item_id, qty_change, transaction_type, reason, created_at, outlet_id')
        .eq('company_id', profile.company_id)
        .gte('created_at', params.startDate)
        .lte('created_at', params.endDate)
        .then(result => result),
    ]);

    if (invoicesError) throw new Error(invoicesError.message);
    if (itemsError) throw new Error(itemsError.message);
    if (menuError) throw new Error(menuError.message);
    if (recipesError) throw new Error(recipesError.message);
    if (inventoryError) throw new Error(inventoryError.message);
    if (ledgerError) throw new Error(ledgerError.message);

    const scopedInvoices = (invoices || []).filter(row => !params.outletId || row.outlet_id === params.outletId);
    const scopedItems = (invoiceItems || []).filter((row: any) => !params.outletId || row.invoices?.outlet_id === params.outletId);
    const scopedInventory = (inventoryItems || []).filter(row => !params.outletId || row.outlet_id === params.outletId);
    const scopedLedger = (inventoryLedger || []).filter(row => !params.outletId || row.outlet_id === params.outletId);

    if (scopedInvoices.length === 0 && scopedItems.length === 0) {
      return DEFAULT_ANSWER;
    }

    const menuMap = new Map((menuItems || []).map((item: any) => [item.id, item]));
    const recipeMap = new Map((recipes || []).map((recipe: any) => [recipe.menu_item_id, Number(recipe.totalCost || 0)]));

    const dailySalesMap = new Map<string, number>();
    const hourlySales = Array(24).fill(0);
    const paymentMap = new Map<string, { amount: number; count: number }>();
    const staffSalesMap = new Map<string, number>();
    const customerMap = new Map<string, { visits: number; spend: number }>();

    scopedInvoices.forEach((invoice: any) => {
      const amount = Number(invoice.grand_total || invoice.subtotal || 0);
      const dayKey = new Date(invoice.created_at).toISOString().split('T')[0];
      dailySalesMap.set(dayKey, (dailySalesMap.get(dayKey) || 0) + amount);
      hourlySales[new Date(invoice.created_at).getHours()] += amount;

      const paymentMethod = String(invoice.payment_method || 'OTHER');
      const paymentCurrent = paymentMap.get(paymentMethod) || { amount: 0, count: 0 };
      paymentCurrent.amount += amount;
      paymentCurrent.count += 1;
      paymentMap.set(paymentMethod, paymentCurrent);

      const staffKey = String(invoice.finalized_by_user_id || 'UNASSIGNED');
      staffSalesMap.set(staffKey, (staffSalesMap.get(staffKey) || 0) + amount);

      const customerKey = String(invoice.buyer_gstin || invoice.buyer_name || '').trim();
      if (customerKey && !/counter customer/i.test(customerKey)) {
        const existing = customerMap.get(customerKey) || { visits: 0, spend: 0 };
        existing.visits += 1;
        existing.spend += amount;
        customerMap.set(customerKey, existing);
      }
    });

    const itemPerfMap = new Map<string, any>();
    const categoryPerfMap = new Map<string, any>();

    scopedItems.forEach((row: any) => {
      const menu: any = menuMap.get(row.menu_item_id) || {};
      const itemName = String(menu?.name || row.menu_item_id || 'Unknown Item');
      const categoryName = String(menu?.menu_categories?.name || 'Uncategorized');
      const qty = Number(row.quantity || 0);
      const sales = Number(row.total_amount || row.taxable_value || 0);
      const price = Number(menu?.base_price || 0);
      const cost = Number(recipeMap.get(row.menu_item_id) || 0);
      const estimatedProfit = cost ? Math.max(0, price - cost) * qty : 0;

      const itemCurrent = itemPerfMap.get(itemName) || { name: itemName, qty: 0, sales: 0, estimated_profit: 0, estimated_margin_pct: null };
      itemCurrent.qty += qty;
      itemCurrent.sales += sales;
      itemCurrent.estimated_profit += estimatedProfit;
      itemCurrent.estimated_margin_pct = cost && price ? Number((((price - cost) / price) * 100).toFixed(2)) : null;
      itemPerfMap.set(itemName, itemCurrent);

      const categoryCurrent = categoryPerfMap.get(categoryName) || { category: categoryName, qty: 0, sales: 0 };
      categoryCurrent.qty += qty;
      categoryCurrent.sales += sales;
      categoryPerfMap.set(categoryName, categoryCurrent);
    });

    const stockMap = new Map<string, number>();
    const wastageMap = new Map<string, number>();
    const movementMap = new Map<string, number>();

    scopedLedger.forEach((row: any) => {
      const itemId = String(row.item_id || '');
      if (!itemId) return;
      stockMap.set(itemId, (stockMap.get(itemId) || 0) + Number(row.qty_change || 0));
      movementMap.set(itemId, (movementMap.get(itemId) || 0) + Math.abs(Number(row.qty_change || 0)));
      if (String(row.transaction_type || '').toUpperCase() === 'WASTAGE') {
        wastageMap.set(itemId, (wastageMap.get(itemId) || 0) + Math.abs(Number(row.qty_change || 0)));
      }
    });

    const inventorySnapshot = scopedInventory.map((item: any) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      min_level: Number(item.min_level || 0),
      current_stock: Number(stockMap.get(item.id) || 0),
      wastage_qty: Number(wastageMap.get(item.id) || 0),
      movement_qty: Number(movementMap.get(item.id) || 0),
      cost_price: Number(item.cost_price || 0),
      preferred_vendor: item.preferred_vendor || null,
    }));

    const topItems = Array.from(itemPerfMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
    const slowItems = Array.from(itemPerfMap.values()).filter(item => item.qty > 0).sort((a, b) => a.qty - b.qty).slice(0, 10);
    const topCategories = Array.from(categoryPerfMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 8);
    const lowStock = inventorySnapshot.filter(item => item.min_level > 0 && item.current_stock <= item.min_level).slice(0, 10);
    const deadStock = inventorySnapshot.filter(item => item.current_stock > 0 && item.movement_qty === 0).slice(0, 10);
    const highWastage = inventorySnapshot.filter(item => item.wastage_qty > 0).sort((a, b) => b.wastage_qty - a.wastage_qty).slice(0, 10);
    const repeatCustomers = Array.from(customerMap.values()).filter(customer => customer.visits > 1);
    const averageOrderValue = scopedInvoices.length
      ? scopedInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.grand_total || invoice.subtotal || 0), 0) / scopedInvoices.length
      : 0;

    const compactDataset = {
      question: trimmedQuestion,
      date_range: { start: params.startDate, end: params.endDate },
      invoice_count: scopedInvoices.length,
      total_sales: Number(scopedInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.grand_total || invoice.subtotal || 0), 0).toFixed(2)),
      average_order_value: Number(averageOrderValue.toFixed(2)),
      total_discount: Number(scopedInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.discount_total || 0), 0).toFixed(2)),
      total_savings: Number(scopedInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.savings_total || 0), 0).toFixed(2)),
      daily_sales: Array.from(dailySalesMap.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([date, sales]) => ({ date, sales: Number(sales.toFixed(2)) })),
      hourly_sales: hourlySales.map((sales, hour) => ({ hour, sales: Number(sales.toFixed(2)) })),
      payment_mode_analysis: Array.from(paymentMap.entries()).map(([mode, values]) => ({ mode, amount: Number(values.amount.toFixed(2)), bills: values.count })).sort((a, b) => b.amount - a.amount),
      staff_sales: Array.from(staffSalesMap.entries()).map(([staff_id, sales]) => ({ staff_id, sales: Number(sales.toFixed(2)) })).sort((a, b) => b.sales - a.sales).slice(0, 10),
      menu_intelligence: {
        top_selling_items: topItems,
        slow_selling_items: slowItems,
        category_sales: topCategories,
      },
      inventory_intelligence: {
        low_stock_alerts: lowStock,
        dead_stock: deadStock,
        high_wastage_items: highWastage,
      },
      customer_intelligence: {
        known_customer_count: customerMap.size,
        repeat_customer_rate_pct: customerMap.size ? Number(((repeatCustomers.length / customerMap.size) * 100).toFixed(2)) : null,
        repeat_customers: repeatCustomers.length,
      },
      data_limits: [
        'Customer intelligence uses buyer_name or buyer_gstin when available; walk-in bills may not identify a customer.',
        'Profit and margin calculations are estimated from recipe totalCost where recipe data exists.',
        'Inventory intelligence is based on current inventory and inventory_ledger movement in the selected period.',
      ],
    };

    const prompt = `SYSTEM ROLE:
You are a world-class Restaurant POS Analytics AI for PapaPOS.

Your goal is to generate intelligent, actionable, and dynamic reports using POS data.

REPORT TYPES:
1. SALES REPORTS: Hourly Sales, Daily Sales, Sales by Item, Sales by Category, Sales by Staff, Peak Hour Analysis, Slow Hour Detection
2. MENU INTELLIGENCE: Top Selling Items, Slow Selling Items, High Profit Items, Low Margin Items, Combo Opportunities
3. INVENTORY INTELLIGENCE: Consumption Analysis, Wastage Detection, Low Stock Alert, Dead Stock Detection
4. CUSTOMER INTELLIGENCE: Repeat Customer Rate, Average Order Value, Customer Favorite Items, Visit Pattern
5. FINANCIAL REPORTS: Payment Mode Analysis, Discount Report, Profit Report, Refund Report

AI DYNAMIC FEATURES:
When the user asks natural language questions like "Why sales dropped yesterday", "Show slow items", or "What should I promote", you must:
1. Analyze data
2. Generate report
3. Provide suggestions
4. Provide actionable insights

RULES:
- Always provide business insights
- Always provide suggestions
- Always keep reports concise
- Always prioritize actionable intelligence
- You are acting as a Restaurant Business Consultant, not a generic analyst
- When promotions or marketing are relevant, suggest concrete offer ideas using slow hours, repeat customer rate, top/slow items, and margin mix
- When the user asks what to promote, include at least one campaign idea, one bundle idea, and one timing suggestion
- If the user asks about customer psychology, explain likely buying behavior only as a business inference from available POS patterns
- If data is missing, say that clearly and avoid guessing

Return STRICT JSON only in this shape:
{
  "report_type": "string",
  "summary": "string",
  "key_findings": ["string"],
  "business_insight": "string",
  "actionable_suggestions": ["string"],
  "supporting_metrics": ["string"]
}

USER QUESTION:
${trimmedQuestion}

PAPAPOS DATASET:
${JSON.stringify(compactDataset)}`;

    const response = await universalAIService.generateContent({
      task_type: 'PAPAPOS_ANALYTICS_REPORT',
      prompt,
      context: {
        outlet_id: params.outletId || null,
        startDate: params.startDate,
        endDate: params.endDate,
      },
    });

    if (response.error) throw new Error(response.error);

    const parsed = safeJsonParse(response.text || '');
    if (!parsed) {
      return {
        report_type: 'GENERAL_ANALYSIS',
        summary: response.text || DEFAULT_ANSWER.summary,
        key_findings: DEFAULT_ANSWER.key_findings,
        business_insight: DEFAULT_ANSWER.business_insight,
        actionable_suggestions: DEFAULT_ANSWER.actionable_suggestions,
        supporting_metrics: [],
      };
    }

    return {
      report_type: String(parsed.report_type || 'GENERAL_ANALYSIS'),
      summary: String(parsed.summary || DEFAULT_ANSWER.summary),
      key_findings: normalizeArray(parsed.key_findings),
      business_insight: String(parsed.business_insight || DEFAULT_ANSWER.business_insight),
      actionable_suggestions: normalizeArray(parsed.actionable_suggestions),
      supporting_metrics: normalizeArray(parsed.supporting_metrics),
    };
  },
};
