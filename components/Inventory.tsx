
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Outlet } from '../types';
import { 
  Search, Plus, History, Trash2, AlertTriangle, X, Package, 
  Loader2, MapPin, Tag, ChevronRight, ArrowUpRight, ArrowDownRight,
  TrendingDown, ShieldCheck, Flame, Scale, Calendar, FileSpreadsheet, Upload, Download, CheckCircle, Zap, FileText, MonitorPlay
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { inventoryService, getSupabase } from '../services/supabaseService';
import { ocrService } from '../services/ocrService';

interface InventoryProps {
  activeOutlet: Outlet | null;
}

const Inventory: React.FC<InventoryProps> = ({ activeOutlet }) => {
  const [batches, setBatches] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'STOCK' | 'LEDGER'>('STOCK');
  const [isStockInModalOpen, setIsStockInModalOpen] = useState(false);
  const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Import States
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'success'>('upload');
  const [importData, setImportData] = useState<any[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrFileInputRef = useRef<HTMLInputElement>(null);

  // OCR States
  const [ocrStep, setOcrStep] = useState<'upload' | 'processing' | 'review' | 'success'>('upload');
  const [ocrData, setOcrData] = useState<any>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  const [stockInData, setStockInData] = useState({
    item_id: '',
    qty: 0,
    cost_price: 0,
    batch_code: '',
    expiry_date: ''
  });

  const [wastageData, setWastageData] = useState({
    batch_id: '',
    qty: 0,
    reason: 'SPOILAGE'
  });

  useEffect(() => {
    if (activeOutlet) loadData();
  }, [activeOutlet]);

  const loadData = async () => {
    if (!activeOutlet) return;
    setLoading(true);
    try {
      const [batchData, ledgerData] = await Promise.all([
        inventoryService.fetchBatches(activeOutlet.id),
        inventoryService.fetchLedger(activeOutlet.id)
      ]);
      setBatches(batchData);
      setLedger(ledgerData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        setImportData(data);
        setImportStep('preview');
      } catch (err) {
        alert("Excel parsing failed.");
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const executeImport = async () => {
    if (!activeOutlet?.id) return;
    setIsParsing(true);
    try {
      for (const row of importData) {
        await inventoryService.recordStockIn({
          item_id: row['ItemName'] || row['item_name'],
          qty: parseFloat(row['Qty'] || row['qty'] || 0),
          cost_price: parseFloat(row['CostPrice'] || row['cost_price'] || 0),
          batch_code: row['BatchCode'] || row['batch_code'] || 'BULK-IMPORT',
          expiry_date: row['Expiry'] || row['expiry'] || null,
          outlet_id: activeOutlet.id
        });
      }
      await loadData();
      setImportStep('success');
    } catch (err) {
      alert("Bulk stock-in failed.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleStockIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOutlet) return;
    setLoading(true);
    try {
      await inventoryService.recordStockIn({
        ...stockInData,
        outlet_id: activeOutlet.id
      });
      await loadData();
      setIsStockInModalOpen(false);
      setStockInData({ item_id: '', qty: 0, cost_price: 0, batch_code: '', expiry_date: '' });
    } catch (err) {
      alert("Stock In failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOutlet) return;
    setLoading(true);
    try {
      const batch = batches.find(b => b.id === wastageData.batch_id);
      await inventoryService.recordWastage({
        ...wastageData,
        item_id: batch?.item_id || 'Unknown',
        outlet_id: activeOutlet.id
      });
      await loadData();
      setIsWastageModalOpen(false);
    } catch (err) {
      alert("Wastage logging failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsOcrProcessing(true);
    setOcrStep('processing');
    
    try {
      const resultId = await ocrService.processInvoice(file);
      const { data, error } = await getSupabase()
        .from('ocr_invoice_results')
        .select('*')
        .eq('id', resultId)
        .single();
        
      if (error) throw error;
      setOcrData(data.extracted_data);
      setOcrStep('review');
    } catch (err) {
      alert("AI Scan failed: " + (err instanceof Error ? err.message : String(err)));
      setOcrStep('upload');
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const executeOcrCommit = async () => {
    if (!activeOutlet?.id || !ocrData?.items) return;
    setIsOcrProcessing(true);
    try {
      for (const item of ocrData.items) {
        await inventoryService.recordStockIn({
          item_id: item.name,
          qty: parseFloat(item.qty || 0),
          cost_price: parseFloat(item.price || 0),
          batch_code: ocrData.invoice_number || 'AI-OCR-INBOUND',
          expiry_date: null,
          outlet_id: activeOutlet.id
        });
      }
      await loadData();
      setOcrStep('success');
    } catch (err) {
      alert("Stock-in from AI scan failed.");
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const aggregatedStock = useMemo(() => {
    const map: Record<string, any> = {};
    batches.forEach(b => {
      if (!map[b.item_id]) {
        map[b.item_id] = { item_id: b.item_id, total_qty: 0, avg_cost: 0, batches_count: 0 };
      }
      map[b.item_id].total_qty += Number(b.current_qty);
      map[b.item_id].batches_count += 1;
    });
    return Object.values(map);
  }, [batches]);

  const filteredStock = aggregatedStock.filter(s => s.item_id.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading && batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 h-screen">
        <Loader2 className="animate-spin text-orange-500" size={48} />
        <p className="mt-4 font-black text-slate-400 uppercase text-xs">Accessing Cloud Ledger...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 min-h-screen pb-32 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Stock Master</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
            <MapPin size={14} className="text-orange-500" /> {activeOutlet?.name} • Real-time Cloud
          </p>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
           <button 
            onClick={() => setView(view === 'STOCK' ? 'LEDGER' : 'STOCK')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all border shrink-0 ${view === 'LEDGER' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border-slate-200'}`}
           >
             {view === 'STOCK' ? <History size={18} /> : <Package size={18} />}
             {view === 'STOCK' ? 'View Ledger' : 'View Stock'}
           </button>
           <button onClick={() => { setOcrStep('upload'); setIsOcrModalOpen(true); }} className="flex items-center gap-2 bg-white border border-indigo-200 text-indigo-600 px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-indigo-50 transition-all shrink-0">
             <Zap size={18} className="text-indigo-500" /> AI Invoice Scan
           </button>
           <button onClick={() => { setImportStep('upload'); setIsImportModalOpen(true); }} className="flex items-center gap-2 bg-white border border-emerald-200 text-emerald-600 px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-emerald-50 transition-all shrink-0"><FileSpreadsheet size={18} /> Bulk Import</button>
           <button onClick={() => setIsWastageModalOpen(true)} className="flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-100 px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-rose-100 transition-all shrink-0">
             <TrendingDown size={18} /> Log Wastage
           </button>
           <button onClick={() => setIsStockInModalOpen(true)} className="flex items-center gap-2 bg-[#FF6B00] text-white px-8 py-3 rounded-xl font-black shadow-xl hover:scale-105 transition-all shrink-0">
             <Plus size={20} /> Stock In
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col justify-between h-40">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl w-fit"><ShieldCheck size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inventory Integrity</p>
               <h3 className="text-2xl font-black text-slate-900">Verified</h3>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col justify-between h-40">
            <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl w-fit"><Package size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active SKU's</p>
               <h3 className="text-2xl font-black text-slate-900">{aggregatedStock.length}</h3>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col justify-between h-40">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl w-fit"><Scale size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Health</p>
               <h3 className="text-2xl font-black text-slate-900">Optimal</h3>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col justify-between h-40">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit"><Flame size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expiring Soon</p>
               <h3 className="text-2xl font-black text-slate-900">03</h3>
            </div>
         </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b flex bg-slate-50/50">
           <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" placeholder="Search by item name..." 
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 font-bold text-slate-900" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
           </div>
        </div>

        <div className="overflow-x-auto">
          {view === 'STOCK' ? (
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <th className="px-8 py-5">Inventory Item</th>
                  <th className="px-8 py-5">Batches</th>
                  <th className="px-8 py-5 text-right">Available Qty</th>
                  <th className="px-8 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStock.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-6">
                       <p className="font-black text-slate-900 text-lg uppercase tracking-tight">{item.item_id}</p>
                    </td>
                    <td className="px-8 py-6">
                       <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black">{item.batches_count} Lots</span>
                    </td>
                    <td className="px-8 py-6 text-right">
                       <p className="font-black text-xl text-slate-900">{item.total_qty.toFixed(2)}</p>
                    </td>
                    <td className="px-8 py-6 text-right">
                       <button onClick={() => { setView('LEDGER'); setSearchQuery(item.item_id); }} className="text-[10px] font-black uppercase text-indigo-600 tracking-widest hover:underline">Full History</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left">
               <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-8 py-5">Event Time</th>
                    <th className="px-8 py-5">Item</th>
                    <th className="px-8 py-5">Type</th>
                    <th className="px-8 py-5 text-right">Qty Change</th>
                    <th className="px-8 py-5 text-right">Balance</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {ledger.map((log, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                       <td className="px-8 py-6">
                          <p className="text-xs font-bold text-slate-500">{new Date(log.created_at).toLocaleString()}</p>
                          <p className="text-[9px] font-black text-slate-400 uppercase mt-1">BY: {log.profiles?.full_name || 'System'}</p>
                       </td>
                       <td className="px-8 py-6 font-black text-slate-900">{log.item_id}</td>
                       <td className="px-8 py-6">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            log.transaction_type === 'STOCK_IN' ? 'bg-emerald-100 text-emerald-700' :
                            log.transaction_type === 'SALE' ? 'bg-blue-100 text-blue-700' :
                            log.transaction_type === 'WASTAGE' ? 'bg-rose-100 text-rose-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {log.transaction_type}
                          </span>
                       </td>
                       <td className="px-8 py-6 text-right">
                          <div className={`flex items-center justify-end gap-1 font-black ${log.qty_change > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                             {log.qty_change > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                             {log.qty_change}
                          </div>
                       </td>
                       <td className="px-8 py-6 text-right font-black text-slate-900">{log.balance_after}</td>
                    </tr>
                  ))}
               </tbody>
            </table>
          )}
        </div>
      </div>

      {isStockInModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
           <div className="bg-white rounded-[48px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center">
                 <h3 className="text-2xl font-black tracking-tight uppercase">Procurement Entry</h3>
                 <button onClick={() => setIsStockInModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={24} /></button>
              </div>
              <form onSubmit={handleStockIn} className="p-10 space-y-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Item Name</label>
                    <input 
                      required className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none" 
                      placeholder="e.g. Amul Milk" 
                      value={stockInData.item_id} 
                      onChange={e => setStockInData({...stockInData, item_id: e.target.value})} 
                    />
                 </div>
                 <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inbound Qty</label>
                       <input 
                        type="number" required 
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none" 
                        value={stockInData.qty} 
                        onChange={e => setStockInData({...stockInData, qty: parseFloat(e.target.value)})} 
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost Price (Net)</label>
                       <input 
                        type="number" required 
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none" 
                        value={stockInData.cost_price} 
                        onChange={e => setStockInData({...stockInData, cost_price: parseFloat(e.target.value)})} 
                       />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Batch/Lot ID</label>
                       <input 
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none" 
                        placeholder="LOT-2024"
                        value={stockInData.batch_code} 
                        onChange={e => setStockInData({...stockInData, batch_code: e.target.value})} 
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expiry Date</label>
                       <input 
                        type="date"
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none" 
                        value={stockInData.expiry_date} 
                        onChange={e => setStockInData({...stockInData, expiry_date: e.target.value})} 
                       />
                    </div>
                 </div>
                 <button type="submit" className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-sm shadow-2xl">Confirm Stock-In</button>
              </form>
           </div>
        </div>
      )}

      {isWastageModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
           <div className="bg-white rounded-[48px] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-10 bg-rose-600 text-white flex justify-between items-center">
                 <h3 className="text-2xl font-black tracking-tight uppercase">Loss Event Entry</h3>
                 <button onClick={() => setIsWastageModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={24} /></button>
              </div>
              <form onSubmit={handleWastage} className="p-10 space-y-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Lot/Batch</label>
                    <select 
                      required className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none"
                      value={wastageData.batch_id}
                      onChange={e => setWastageData({...wastageData, batch_id: e.target.value})}
                    >
                       <option value="" className="text-slate-900">Select Batch to Deduct</option>
                       {batches.map(b => (
                         <option key={b.id} value={b.id} className="text-slate-900">{b.item_id} (Lot: {b.batch_code || 'N/A'}) - {b.current_qty} left</option>
                       ))}
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loss Qty</label>
                    <input 
                      type="number" required 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none" 
                      value={wastageData.qty}
                      onChange={e => setWastageData({...wastageData, qty: parseFloat(e.target.value)})}
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason Category</label>
                    <select 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none"
                      value={wastageData.reason}
                      onChange={e => setWastageData({...wastageData, reason: e.target.value})}
                    >
                       <option value="SPOILAGE" className="text-slate-900">Spoilage / Expired</option>
                       <option value="BREAKAGE" className="text-slate-900">Physical Breakage</option>
                       <option value="ERROR" className="text-slate-900">Kitchen Error</option>
                       <option value="ADJUSTMENT" className="text-slate-900">Stock Take Adjustment</option>
                    </select>
                 </div>
                 <button type="submit" className="w-full py-6 bg-rose-600 text-white rounded-[28px] font-black uppercase tracking-widest text-sm shadow-xl">Commit Loss Event</button>
              </form>
           </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
           <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
              <div className="p-8 bg-emerald-600 text-white flex justify-between items-center">
                 <h3 className="text-xl font-black">Bulk Stock In (Import)</h3>
                 <button onClick={() => setIsImportModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={20} /></button>
              </div>
              <div className="p-10 flex-1 overflow-y-auto">
                 {importStep === 'upload' && (
                   <div className="flex flex-col items-center justify-center py-10 space-y-6">
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full max-w-md p-10 border-4 border-dashed border-slate-200 rounded-[40px] flex flex-col items-center gap-4 hover:border-emerald-500 hover:bg-emerald-50 transition-all cursor-pointer group"
                      >
                         <Upload size={48} className="text-emerald-600 group-hover:scale-110 transition-transform" />
                         <div className="text-center">
                            <p className="text-lg font-black text-slate-800">Upload Stock Excel</p>
                            <p className="text-sm text-slate-400 font-medium">Click to select file</p>
                         </div>
                         <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
                      </div>
                      <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 max-w-lg">
                         <p className="text-xs font-bold text-blue-700 leading-relaxed">
                            Required Columns: ItemName, Qty, CostPrice. Optional: BatchCode, Expiry.
                         </p>
                      </div>
                   </div>
                 )}
                 {importStep === 'preview' && (
                   <div className="space-y-6">
                      <p className="text-sm font-bold text-slate-500">Previewing {importData.length} stock entries for {activeOutlet?.name}.</p>
                      <div className="bg-slate-50 rounded-2xl overflow-x-auto max-h-60">
                         <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 font-black uppercase text-slate-400">
                               <tr><th className="p-4">Item</th><th className="p-4">Qty</th><th className="p-4">Cost</th><th className="p-4">Batch</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                               {importData.slice(0, 10).map((row, i) => (
                                 <tr key={i}>
                                   <td className="p-4 font-bold">{row.ItemName || row.item_name}</td>
                                   <td className="p-4">{row.Qty || row.qty}</td>
                                   <td className="p-4">₹{row.CostPrice || row.cost_price}</td>
                                   <td className="p-4 text-slate-400">{row.BatchCode || row.batch_code || 'N/A'}</td>
                                 </tr>
                               ))}
                            </tbody>
                         </table>
                      </div>
                      <button onClick={executeImport} disabled={isParsing} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-2">
                        {isParsing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />} Commit Inbound Stock
                      </button>
                   </div>
                 )}
                 {importStep === 'success' && (
                   <div className="text-center py-10 space-y-6">
                      <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto"><CheckCircle size={40} /></div>
                      <h4 className="text-2xl font-black text-slate-900">Stock Synchronized!</h4>
                      <button onClick={() => setIsImportModalOpen(false)} className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Done</button>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* AI OCR Modal */}
      {isOcrModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
           <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
              <div className="p-8 bg-indigo-600 text-white flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <Zap size={24} />
                    <h3 className="text-xl font-black uppercase tracking-tight">AI Invoice Intelligence</h3>
                 </div>
                 <button onClick={() => setIsOcrModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={20} /></button>
              </div>
              <div className="p-10 flex-1 overflow-y-auto min-h-[400px]">
                 {ocrStep === 'upload' && (
                   <div className="flex flex-col items-center justify-center py-10 space-y-6">
                      <div 
                        onClick={() => ocrFileInputRef.current?.click()}
                        className="w-full max-w-md p-10 border-4 border-dashed border-slate-200 rounded-[40px] flex flex-col items-center gap-4 hover:border-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer group"
                      >
                         <FileText size={48} className="text-indigo-600 group-hover:scale-110 transition-transform" />
                         <div className="text-center">
                            <p className="text-lg font-black text-slate-800">Scan Purchase Invoice</p>
                            <p className="text-sm text-slate-400 font-medium">Upload Image or PDF</p>
                         </div>
                         <input ref={ocrFileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleOcrUpload} />
                      </div>
                      <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 max-w-lg text-center">
                         <p className="text-xs font-bold text-indigo-700 leading-relaxed">
                            Our AI will automatically extract vendor details, line items, quantities, and prices from your invoice.
                         </p>
                      </div>
                   </div>
                 )}

                 {ocrStep === 'processing' && (
                   <div className="flex flex-col items-center justify-center py-20 space-y-6">
                      <div className="relative">
                         <div className="w-24 h-24 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                         <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600 animate-pulse" size={32} />
                      </div>
                      <div className="text-center">
                         <h4 className="text-xl font-black text-slate-900">Analyzing Document...</h4>
                         <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-2">Gemini AI is reading your invoice</p>
                      </div>
                   </div>
                 )}

                 {ocrStep === 'review' && ocrData && (
                   <div className="space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor</p>
                            <p className="font-black text-slate-900 truncate">{ocrData.vendor_name}</p>
                         </div>
                         <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice #</p>
                            <p className="font-black text-slate-900">{ocrData.invoice_number}</p>
                         </div>
                         <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Value</p>
                            <p className="font-black text-slate-900">₹{ocrData.total_amount}</p>
                         </div>
                      </div>

                      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
                         <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 font-black uppercase text-slate-400 text-[10px] tracking-widest">
                               <tr>
                                  <th className="px-6 py-4">Extracted Item</th>
                                  <th className="px-6 py-4 text-center">Qty</th>
                                  <th className="px-6 py-4 text-right">Unit Price</th>
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                               {ocrData.items?.map((item: any, i: number) => (
                                 <tr key={i}>
                                   <td className="px-6 py-4 font-bold text-slate-800">{item.name}</td>
                                   <td className="px-6 py-4 text-center font-black">{item.qty} {item.unit}</td>
                                   <td className="px-6 py-4 text-right font-black">₹{item.price}</td>
                                 </tr>
                               ))}
                            </tbody>
                         </table>
                      </div>

                      <div className="flex gap-4">
                         <button onClick={() => setOcrStep('upload')} className="flex-1 py-5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs">Retake Scan</button>
                         <button onClick={executeOcrCommit} disabled={isOcrProcessing} className="flex-[2] py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl flex items-center justify-center gap-2">
                           {isOcrProcessing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />} Confirm & Stock-In
                         </button>
                      </div>
                   </div>
                 )}

                 {ocrStep === 'success' && (
                   <div className="text-center py-10 space-y-6">
                      <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto"><CheckCircle size={40} /></div>
                      <h4 className="text-2xl font-black text-slate-900">Automation Complete!</h4>
                      <p className="text-slate-400 font-medium">All items have been added to your cloud inventory.</p>
                      <button onClick={() => setIsOcrModalOpen(false)} className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Back to Inventory</button>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
