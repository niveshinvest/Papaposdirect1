
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
import * as XLSX from 'xlsx';
import { Edit3, X as CloseIcon, Plus, Trash2, Save } from 'lucide-react';

const Reports: React.FC<{ activeOutletId?: string | null }> = ({ activeOutletId }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [editReason, setEditReason] = useState('');
  const [dateRange, setDateRange] = useState({ 
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadReport();
  }, [activeOutletId, dateRange]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const stats = await analyticsService.getFullSalesReport({
        outletId: activeOutletId,
        startDate: `${dateRange.start}T00:00:00.000Z`,
        endDate: `${dateRange.end}T23:59:59.999Z`
      });
      setData(stats);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (data.length === 0) return alert("No data to export");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
    XLSX.writeFile(wb, `Sales_Report_${dateRange.start}_to_${dateRange.end}.xlsx`);
  };

  const startEdit = async (invoiceId: string) => {
    setLoading(true);
    try {
      const inv = await salesService.getInvoiceWithItems(invoiceId);
      setEditingInvoice(inv);
    } catch (e) {
      alert("Failed to load invoice details");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editReason) return alert("Please provide a reason for editing");
    setLoading(true);
    try {
      await salesService.editInvoice({
        invoiceId: editingInvoice.id,
        newSubtotal: editingInvoice.subtotal,
        newTotalTax: editingInvoice.total_tax,
        newGrandTotal: editingInvoice.grand_total,
        newItems: editingInvoice.invoice_items,
        editReason
      });
      setEditingInvoice(null);
      setEditReason('');
      await loadReport();
    } catch (e: any) {
      alert(`Failed to save: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (idx: number, updates: any) => {
    const newItems = [...editingInvoice.invoice_items];
    newItems[idx] = { ...newItems[idx], ...updates };
    
    // Recalculate totals
    const subtotal = newItems.reduce((acc, it) => acc + Number(it.total_amount), 0);
    const totalTax = newItems.reduce((acc, it) => acc + Number(it.tax_amount), 0);
    
    setEditingInvoice({
      ...editingInvoice,
      invoice_items: newItems,
      subtotal,
      total_tax: totalTax,
      grand_total: subtotal // Assuming subtotal is already inclusive or exclusive based on previous logic
    });
  };

  const stats = useMemo(() => {
    const totalSales = data.reduce((acc, curr) => acc + Number(curr.subtotal), 0);
    const totalTax = data.reduce((acc, curr) => acc + Number(curr.total_tax), 0);
    return { totalSales, totalTax, count: data.length };
  }, [data]);

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
      </div>

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
                         <td className="px-8 py-6 text-right font-black text-slate-900">₹{Number(inv.subtotal).toLocaleString()}</td>
                         <td className="px-8 py-6 text-right">
                            <button 
                              onClick={() => startEdit(inv.id)}
                              className="p-2 text-slate-300 hover:text-indigo-600 transition-all"
                            >
                              <Edit3 size={16} />
                            </button>
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
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
                       {editingInvoice.invoice_items.map((item: any, idx: number) => (
                         <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                            <div className="flex-1">
                               <p className="font-black text-slate-900">{item.item_name}</p>
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
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total</p>
                                  <p className="font-black text-indigo-600">₹{item.total_amount.toFixed(2)}</p>
                               </div>
                            </div>
                         </div>
                       ))}
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
    </div>
  );
};

export default Reports;
