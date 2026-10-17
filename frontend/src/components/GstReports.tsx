
import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, ShieldCheck, Download, Calculator, 
  Calendar, CheckCircle2, AlertCircle, FileText, 
  TrendingUp, BarChart3, Clock, ArrowUpRight, 
  Archive, Lock, RefreshCcw, Eye, Loader2, MapPin, Percent,
  ShieldAlert, Database, Scale, ListFilter
} from 'lucide-react';
import { getSupabase, authService } from '../services/supabaseService';
import { analyticsService } from '../services/analyticsService';
import { GstReport, ReportSnapshot, Outlet } from '../types';
import { useNavigate } from 'react-router-dom';

const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

const GstReports: React.FC<{ activeOutlet: Outlet | null }> = ({ activeOutlet }) => {
  const navigate = useNavigate();
  const [data, setData] = useState<any[]>([]);
  const [hsnSummary, setHsnSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'MONTHLY' | 'FY'>('MONTHLY');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedFy, setSelectedFy] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    // Indian FY: April to March
    return month < 3 ? `${(year - 1) % 100}-${year % 100}` : `${year % 100}-${(year + 1) % 100}`;
  });
  const [activeSubTab, setActiveSubTab] = useState<'SALES' | 'HSN' | 'LIABILITY'>('SALES');

  // Dynamic Year List (Current +/- 2 years)
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => current - 2 + i);
  }, []);

  // Dynamic FY List
  const fyList = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 4 }, (_, i) => {
      const startYear = current - 2 + i;
      return `${startYear % 100}-${(startYear + 1) % 100}`;
    });
  }, []);

  useEffect(() => {
    loadGstData();
  }, [activeOutlet, selectedMonth, selectedYear, selectedFy, filterMode]);

  const loadGstData = async () => {
    if (!activeOutlet || !activeOutlet.gst_registered) return;
    setLoading(true);
    try {
      const client = getSupabase();
      const profile = await authService.getProfile();
      
      let start: string;
      let end: string;

      if (filterMode === 'MONTHLY') {
        start = new Date(selectedYear, selectedMonth, 1).toISOString();
        end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999).toISOString();
      } else {
        // FY: April 1st of start year to March 31st of end year
        const [startShort, endShort] = selectedFy.split('-').map(Number);
        const fullStartYear = 2000 + (startShort < 50 ? startShort : startShort - 100); // Simple 21st century logic
        start = new Date(fullStartYear, 3, 1).toISOString(); // April 1
        end = new Date(fullStartYear + 1, 2, 31, 23, 59, 59, 999).toISOString(); // March 31
      }

      const params = { outletId: activeOutlet.id, startDate: start, endDate: end };

      const [invoicesRes, hsnRes] = await Promise.all([
        client
          .from('invoices')
          .select('*')
          .eq('company_id', profile.company_id)
          .eq('outlet_id', activeOutlet.id)
          .gte('created_at', start)
          .lte('created_at', end),
        analyticsService.getHsnSummary(params)
      ]);

      if (invoicesRes.error) throw new Error(invoicesRes.error.message);
      setData(invoicesRes.data || []);
      setHsnSummary(hsnRes || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const gstSummary = useMemo(() => {
    const summary = {
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalTax: 0,
      gross: 0,
      count: data.length
    };

    data.forEach(inv => {
      summary.taxable += Number(inv.taxable_value || 0);
      summary.cgst += Number(inv.cgst_amount || 0);
      summary.sgst += Number(inv.sgst_amount || 0);
      summary.igst += Number(inv.igst_amount || 0);
      summary.totalTax += Number(inv.total_tax || 0);
      summary.gross += Number(inv.grand_total || 0);
    });

    return summary;
  }, [data]);

  const dayWiseSales = useMemo(() => {
    const map: Record<string, any> = {};
    data.forEach(inv => {
       const date = new Date(inv.created_at).toLocaleDateString();
       if (!map[date]) map[date] = { date, taxable: 0, tax: 0, gross: 0, bills: 0 };
       map[date].taxable += Number(inv.taxable_value);
       map[date].tax += Number(inv.total_tax);
       map[date].gross += Number(inv.grand_total);
       map[date].bills += 1;
    });
    return Object.values(map);
  }, [data]);

  if (activeOutlet && !activeOutlet.gst_registered) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500">
         <div className="bg-amber-50 border-2 border-amber-100 p-16 rounded-[60px] flex flex-col items-center text-center space-y-8 shadow-xl shadow-amber-900/5">
            <div className="w-24 h-24 bg-amber-100 text-amber-600 rounded-[32px] flex items-center justify-center shadow-inner">
               <ShieldAlert size={48} className="animate-pulse" />
            </div>
            <div className="space-y-3">
               <h3 className="text-3xl font-black text-amber-900 tracking-tight uppercase">GST Config Missing</h3>
               <p className="text-amber-700 font-medium max-w-md mx-auto leading-relaxed">
                  This outlet is currently classified as <b>Non-GST Registered</b>. Analytical tax trails and compliance reports are restricted for this business node.
               </p>
            </div>
            <button 
              onClick={() => navigate('/settings')}
              className="bg-amber-600 text-white px-10 py-5 rounded-[24px] font-black uppercase text-xs tracking-widest shadow-xl shadow-amber-600/20 hover:scale-105 active:scale-95 transition-all"
            >
               Configure Compliance in Settings
            </button>
         </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 min-h-screen pb-32 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
             <ShieldCheck size={16} />
             <span className="text-[10px] font-black uppercase tracking-widest">Tax Compliance Engine</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">GST Audit Trail</h2>
          {activeOutlet && <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2"><MapPin size={12} className="text-orange-500" /> {activeOutlet.name} • {activeOutlet.gst_number}</p>}
        </div>
        <div className="flex gap-3">
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
             <button 
               onClick={() => setFilterMode('MONTHLY')}
               className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${filterMode === 'MONTHLY' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}
             >
               Monthly
             </button>
             <button 
               onClick={() => setFilterMode('FY')}
               className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${filterMode === 'FY' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}
             >
               Financial Year
             </button>
          </div>

          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
             {filterMode === 'MONTHLY' ? (
               <>
                 <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="p-2 text-xs font-black outline-none border-none bg-transparent cursor-pointer">
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                 </select>
                 <span className="flex items-center text-slate-300">|</span>
                 <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="p-2 text-xs font-black outline-none border-none bg-transparent cursor-pointer">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                 </select>
               </>
             ) : (
               <select value={selectedFy} onChange={e => setSelectedFy(e.target.value)} className="p-2 text-xs font-black outline-none border-none bg-transparent cursor-pointer">
                  {fyList.map(fy => <option key={fy} value={fy}>FY 20{fy}</option>)}
               </select>
             )}
          </div>
          <button className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-xl font-black shadow-xl hover:scale-105 transition-all text-xs uppercase tracking-widest">
            <Download size={20} /> Export GSTR-1
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">B2C Taxable</p>
           <h3 className="text-2xl font-black text-slate-900 mt-2">₹{gstSummary.taxable.toLocaleString()}</h3>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Output CGST</p>
           <h3 className="text-2xl font-black text-indigo-600 mt-2">₹{gstSummary.cgst.toLocaleString()}</h3>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Output SGST</p>
           <h3 className="text-2xl font-black text-indigo-600 mt-2">₹{gstSummary.sgst.toLocaleString()}</h3>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Liability</p>
           <h3 className="text-2xl font-black text-emerald-600 mt-2">₹{gstSummary.totalTax.toLocaleString()}</h3>
        </div>
      </div>

      <div className="flex gap-4 p-1 bg-white rounded-2xl shadow-sm border border-slate-100 w-fit">
         {[
           { id: 'SALES', label: 'Sales Ledger', icon: <FileText size={14} /> },
           { id: 'HSN', label: 'HSN Summary', icon: <Database size={14} /> },
           { id: 'LIABILITY', label: 'Day-wise Audit', icon: <Calculator size={14} /> }
         ].map(tab => (
           <button 
             key={tab.id}
             onClick={() => setActiveSubTab(tab.id as any)}
             className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
           >
             {tab.icon} {tab.label}
           </button>
         ))}
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-300">
           <Loader2 className="animate-spin text-orange-500" size={48} />
           <p className="text-[10px] font-black uppercase tracking-widest">Reconstructing Tax History...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="bg-white p-32 rounded-[60px] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-center space-y-6">
           <Archive size={80} className="text-slate-100" />
           <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Empty Compliance Vault</h3>
           <p className="text-sm text-slate-400 font-bold max-w-xs">No taxable events found for {filterMode === 'MONTHLY' ? `${MONTHS[selectedMonth]} ${selectedYear}` : `FY 20${selectedFy}`}.</p>
        </div>
      ) : (
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4">
           {activeSubTab === 'SALES' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="px-8 py-5">Invoice</th>
                        <th className="px-8 py-5">Date</th>
                        <th className="px-8 py-5 text-right">Taxable</th>
                        <th className="px-8 py-5 text-right">CGST</th>
                        <th className="px-8 py-5 text-right">SGST</th>
                        <th className="px-8 py-5 text-right">Grand Total</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                      {data.map((inv, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-8 py-6 font-black text-slate-800">{inv.invoice_number}</td>
                          <td className="px-8 py-6 text-xs font-bold text-slate-500">{new Date(inv.created_at).toLocaleDateString()}</td>
                          <td className="px-8 py-6 text-right font-bold text-slate-600">₹{Number(inv.taxable_value).toFixed(2)}</td>
                          <td className="px-8 py-6 text-right font-bold text-indigo-500">₹{Number(inv.cgst_amount).toFixed(2)}</td>
                          <td className="px-8 py-6 text-right font-bold text-indigo-500">₹{Number(inv.sgst_amount).toFixed(2)}</td>
                          <td className="px-8 py-6 text-right font-black text-slate-900">₹{Number(inv.grand_total).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
           )}

           {activeSubTab === 'HSN' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="px-8 py-5">HSN / SAC</th>
                        <th className="px-8 py-5">Rate (%)</th>
                        <th className="px-8 py-5 text-right">Taxable Value</th>
                        <th className="px-8 py-5 text-right">Central Tax</th>
                        <th className="px-8 py-5 text-right">State Tax</th>
                        <th className="px-8 py-5 text-right">Total Tax</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                      {hsnSummary.map((hsn, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-8 py-6 font-black text-slate-800">{hsn.hsn_code || '9963'}</td>
                          <td className="px-8 py-6">
                             <span className="px-2 py-1 bg-slate-100 rounded font-black text-[10px]">{hsn.tax_rate}%</span>
                          </td>
                          <td className="px-8 py-6 text-right font-bold text-slate-600">₹{Number(hsn.taxable_value).toFixed(2)}</td>
                          <td className="px-8 py-6 text-right font-bold text-indigo-500">₹{Number(hsn.cgst).toFixed(2)}</td>
                          <td className="px-8 py-6 text-right font-bold text-indigo-500">₹{Number(hsn.sgst).toFixed(2)}</td>
                          <td className="px-8 py-6 text-right font-black text-emerald-600">₹{Number(hsn.total_tax).toFixed(2)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
           )}

           {activeSubTab === 'LIABILITY' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="px-8 py-5">Reporting Date</th>
                        <th className="px-8 py-5 text-center">Invoices</th>
                        <th className="px-8 py-5 text-right">Period Taxable</th>
                        <th className="px-8 py-5 text-right">Period GST</th>
                        <th className="px-8 py-5 text-right">Period Gross</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                      {dayWiseSales.map((day, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-8 py-6 font-black text-slate-800">{day.date}</td>
                          <td className="px-8 py-6 text-center">
                             <span className="px-3 py-1 bg-slate-900 text-white rounded-full text-[10px] font-black">{day.bills} Bills</span>
                          </td>
                          <td className="px-8 py-6 text-right font-bold text-slate-600">₹{Number(day.taxable).toFixed(2)}</td>
                          <td className="px-8 py-6 text-right font-black text-indigo-600">₹{Number(day.tax).toFixed(2)}</td>
                          <td className="px-8 py-6 text-right font-black text-slate-900">₹{Number(day.gross).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
           )}
        </div>
      )}
    </div>
  );
};

export default GstReports;
