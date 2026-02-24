
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
import * as XLSX from 'xlsx';

const Reports: React.FC<{ activeOutletId?: string | null }> = ({ activeOutletId }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
                         <td className="px-8 py-6 text-right font-black text-slate-900">₹{Number(inv.total_amount).toLocaleString()}</td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
