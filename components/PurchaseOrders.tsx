
import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Search, FileText, ChevronRight, Truck, 
  CheckCircle, Clock, AlertCircle, Trash2, Save, X, ArrowRight,
  Database, RefreshCw, AlertTriangle, Check, ShoppingBag, Sparkles, 
  ExternalLink, BarChart, Globe, Zap, Loader2, ShieldCheck, Lock, Camera, Upload, Edit3, UserCheck
} from 'lucide-react';
import { purchaseService } from '../services/purchaseService';
import { ocrService } from '../services/ocrService';
import { Outlet } from '../types';

interface PurchaseOrdersProps {
  activeOutlet: Outlet | null;
}

const PurchaseOrders: React.FC<PurchaseOrdersProps> = ({ activeOutlet }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [ocrQueue, setOcrQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedOcr, setSelectedOcr] = useState<any>(null);
  const [view, setView] = useState<'LIST' | 'REVIEW'>('LIST');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [poData, queueData] = await Promise.all([
        purchaseService.fetchProcurementOrders(),
        purchaseService.fetchOcrQueue()
      ]);
      setOrders(poData);
      setOcrQueue(queueData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      await ocrService.processInvoice(file);
      await loadData();
      alert("AI Extraction Complete. Please review in the OCR Queue.");
    } catch (err) {
      alert("AI Extraction Failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  // FIX START
  const handleManualEntry = () => {
    setSelectedOcr({
      id: null,
      extracted_data: {
        vendor_name: '',
        invoice_date: new Date().toISOString().split('T')[0],
        vendor_gstin: '',
        invoice_number: '',
        total_amount: 0,
        items: []
      }
    });
    setView('REVIEW');
  };
  // FIX END

  const handleCommitOcr = async () => {
    if (!selectedOcr || !activeOutlet) return;
    setLoading(true);
    try {
      if (selectedOcr.is_existing) {
        // Update existing order
        await purchaseService.updateProcurementOrder(
          selectedOcr.id, 
          {
            order_date: selectedOcr.extracted_data.invoice_date,
            total_amount: selectedOcr.extracted_data.total_amount,
            status: selectedOcr.extracted_data.status || 'RECEIVED'
          },
          selectedOcr.extracted_data.items.map((it: any) => ({
            item_name: it.name,
            qty: it.qty,
            unit: it.unit,
            unit_price: it.price,
            total_amount: it.qty * it.price
          })),
          activeOutlet.id
        );
      } else {
        // Create new from OCR
        await purchaseService.commitOcrResult(selectedOcr.id, selectedOcr.extracted_data, activeOutlet.id);
      }
      await loadData();
      setSelectedOcr(null);
      setView('LIST');
    } catch (err: any) {
      console.error(err);
      alert(`Failed to save procurement data: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditOrder = (order: any) => {
    setSelectedOcr({
      id: order.id,
      is_existing: true,
      extracted_data: {
        vendor_name: order.suppliers?.name || 'Unknown',
        invoice_date: order.order_date,
        vendor_gstin: '', // Not stored in procurement_orders directly
        invoice_number: order.id.slice(0, 8),
        total_amount: order.total_amount,
        status: order.status,
        items: (order.purchase_items || []).map((it: any) => ({
          name: it.item_name,
          qty: it.qty,
          unit: it.unit,
          price: it.unit_price
        }))
      }
    });
    setView('REVIEW');
  };

  const handleDeleteItem = (index: number) => {
    if (!selectedOcr) return;
    const newItems = [...selectedOcr.extracted_data.items];
    newItems.splice(index, 1);
    
    // Recalculate total
    const newTotal = newItems.reduce((acc: number, item: any) => acc + (Number(item.qty) * Number(item.price)), 0);
    
    setSelectedOcr({
      ...selectedOcr,
      extracted_data: {
        ...selectedOcr.extracted_data,
        items: newItems,
        total_amount: newTotal
      }
    });
  };

  if (loading && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 h-screen">
        <Loader2 className="animate-spin text-indigo-500" size={48} />
        <p className="mt-4 font-black text-slate-400 uppercase text-xs">Accessing Supply Chain Cloud...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 min-h-screen pb-32 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Supply Ledger</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
            <Database size={14} className="text-indigo-500" /> Procurement & OCR Pipeline
          </p>
        </div>
        <div className="flex gap-4">
           <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,application/pdf" />
           <button 
             disabled={isProcessing}
             onClick={() => fileInputRef.current?.click()}
             className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-xl font-black shadow-xl hover:scale-105 transition-all"
           >
             {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />} 
             Scan Invoice (AI)
           </button>
           {/* FIX START */}
           <button 
             onClick={handleManualEntry}
             className="flex items-center gap-2 bg-[#FF6B00] text-white px-8 py-3 rounded-xl font-black shadow-xl hover:scale-105 transition-all"
           >
             <Plus size={20} /> Manual Entry
           </button>
           {/* FIX END */}
        </div>
      </div>

      {ocrQueue.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 p-6 rounded-[32px] flex items-center justify-between gap-6">
           <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl"><Sparkles size={24} /></div>
              <div>
                 <h4 className="font-black text-amber-900 uppercase text-xs tracking-widest">Action Required</h4>
                 <p className="text-sm font-bold text-amber-700">You have {ocrQueue.length} AI extractions pending manual verification.</p>
              </div>
           </div>
           <button 
             onClick={() => { setSelectedOcr(ocrQueue[0]); setView('REVIEW'); }}
             className="bg-amber-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-amber-700 transition-all"
           >
              Open Review Studio
           </button>
        </div>
      )}

      {view === 'LIST' ? (
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
           <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-black text-slate-800 uppercase text-sm tracking-widest">Procurement Registry</h3>
              <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                 <input type="text" placeholder="Search by vendor..." className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-900" />
              </div>
           </div>
           <div className="overflow-x-auto">
              <table className="w-full text-left">
                 <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    <tr>
                       <th className="px-8 py-5">Date</th>
                       <th className="px-8 py-5">Supplier</th>
                       <th className="px-8 py-5">Status</th>
                       <th className="px-8 py-5 text-right">Total (Incl. Tax)</th>
                       <th className="px-8 py-5 text-right">Actions</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {orders.length === 0 ? (
                      <tr><td colSpan={5} className="py-20 text-center text-slate-300 font-black uppercase text-xs">No procurement records found</td></tr>
                    ) : orders.map(order => (
                      <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                         <td className="px-8 py-6">
                            <p className="font-bold text-slate-500 text-xs">{new Date(order.order_date).toLocaleDateString()}</p>
                         </td>
                         <td className="px-8 py-6">
                            <p className="font-black text-slate-900">{order.suppliers?.name}</p>
                         </td>
                         <td className="px-8 py-6">
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                              order.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                               {order.status}
                            </span>
                         </td>
                         <td className="px-8 py-6 text-right">
                            <p className="font-black text-slate-900">₹{order.total_amount.toLocaleString()}</p>
                         </td>
                         <td className="px-8 py-6 text-right">
                            <button 
                              onClick={() => handleEditOrder(order)}
                              className="p-2 text-slate-300 hover:text-slate-900 transition-all"
                            >
                              <Edit3 size={18} />
                            </button>
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
           <div className="bg-slate-900 rounded-[48px] p-10 flex flex-col items-center justify-center text-white border-8 border-slate-800 shadow-2xl min-h-[600px]">
              <div className="text-center space-y-6">
                 <div className="p-8 bg-white/10 rounded-full border-4 border-white/5 mx-auto w-fit animate-pulse">
                    <FileText size={80} className="text-indigo-400" />
                 </div>
                 <div>
                    <h3 className="text-2xl font-black">Invoice Preview</h3>
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-2">{selectedOcr?.file_name}</p>
                 </div>
                 <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-4 max-w-sm mx-auto">
                    <div className="flex justify-between text-xs">
                       <span className="text-slate-500">{selectedOcr?.is_existing ? 'Audit Status' : 'Extraction Confidence'}</span>
                       <span className="font-black text-emerald-400">{selectedOcr?.is_existing ? 'VERIFIED' : `${(selectedOcr?.confidence_score * 100 || 0).toFixed(0)}%`}</span>
                    </div>
                    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                       <div className="bg-emerald-400 h-full" style={{ width: `${selectedOcr?.confidence_score * 100}%` }}></div>
                    </div>
                 </div>
              </div>
           </div>

           <div className="bg-white rounded-[48px] shadow-2xl border border-slate-100 flex flex-col">
              <div className="p-8 border-b flex justify-between items-center bg-slate-50/50 rounded-t-[48px]">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg"><UserCheck size={20} /></div>
                    <h3 className="text-xl font-black text-slate-900">Review Studio</h3>
                 </div>
                 <button onClick={() => setView('LIST')} className="p-2 bg-white border rounded-full text-slate-400"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier Name</label>
                       <input 
                         className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500" 
                         value={selectedOcr?.extracted_data.vendor_name}
                         onChange={e => setSelectedOcr({...selectedOcr, extracted_data: {...selectedOcr.extracted_data, vendor_name: e.target.value}})}
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice Date</label>
                       <input 
                         type="date"
                         className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-900" 
                         value={selectedOcr?.extracted_data.invoice_date}
                         onChange={e => setSelectedOcr({...selectedOcr, extracted_data: {...selectedOcr.extracted_data, invoice_date: e.target.value}})}
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier GSTIN</label>
                       <input 
                         className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-900 uppercase font-mono" 
                         value={selectedOcr?.extracted_data.vendor_gstin}
                         onChange={e => setSelectedOcr({...selectedOcr, extracted_data: {...selectedOcr.extracted_data, vendor_gstin: e.target.value}})}
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice Number</label>
                       <input 
                         className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-900" 
                         value={selectedOcr?.extracted_data.invoice_number}
                         onChange={e => setSelectedOcr({...selectedOcr, extracted_data: {...selectedOcr.extracted_data, invoice_number: e.target.value}})}
                       />
                    </div>
                 </div>

                  {/* FIX START */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extracted Line Items</h4>
                      <button 
                        onClick={() => {
                          const newItems = [...selectedOcr.extracted_data.items, { name: '', qty: 1, unit: 'unit', price: 0 }];
                          setSelectedOcr({...selectedOcr, extracted_data: {...selectedOcr.extracted_data, items: newItems}});
                        }}
                        className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1"
                      >
                        <Plus size={12} /> Add Item
                      </button>
                    </div>
                    <div className="space-y-3">
                  {/* FIX END */}
                       {selectedOcr?.extracted_data.items.map((item: any, idx: number) => (
                         <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                            <div className="flex-1 min-w-0">
                               <input 
                                 className="w-full bg-transparent border-none font-bold text-slate-800 focus:ring-0 p-0"
                                 value={item.name}
                                 onChange={e => {
                                   const newItems = [...selectedOcr.extracted_data.items];
                                   newItems[idx].name = e.target.value;
                                   setSelectedOcr({...selectedOcr, extracted_data: {...selectedOcr.extracted_data, items: newItems}});
                                 }}
                               />
                               <p className="text-[9px] font-black text-slate-400 uppercase">HSN: {item.hsn || 'N/A'}</p>
                            </div>
                            <div className="flex items-center gap-6">
                               <div className="text-right w-20">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Qty</p>
                                  <input 
                                    type="number"
                                    className="w-full bg-transparent border-none font-black text-slate-900 text-right focus:ring-0 p-0"
                                    value={item.qty}
                                    onChange={e => {
                                      const newItems = [...selectedOcr.extracted_data.items];
                                      newItems[idx].qty = Number(e.target.value);
                                      const newTotal = newItems.reduce((acc: number, it: any) => acc + (Number(it.qty) * Number(it.price)), 0);
                                      setSelectedOcr({...selectedOcr, extracted_data: {...selectedOcr.extracted_data, items: newItems, total_amount: newTotal}});
                                    }}
                                  />
                               </div>
                               <div className="text-right w-24">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Rate</p>
                                  <div className="flex items-center justify-end">
                                    <span className="text-indigo-600 font-black mr-1">₹</span>
                                    <input 
                                      type="number"
                                      className="w-full bg-transparent border-none font-black text-indigo-600 text-right focus:ring-0 p-0"
                                      value={item.price}
                                      onChange={e => {
                                        const newItems = [...selectedOcr.extracted_data.items];
                                        newItems[idx].price = Number(e.target.value);
                                        const newTotal = newItems.reduce((acc: number, it: any) => acc + (Number(it.qty) * Number(it.price)), 0);
                                        setSelectedOcr({...selectedOcr, extracted_data: {...selectedOcr.extracted_data, items: newItems, total_amount: newTotal}});
                                      }}
                                    />
                                  </div>
                               </div>
                               <button 
                                 onClick={() => handleDeleteItem(idx)}
                                 className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                               >
                                 <X size={16} />
                               </button>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>

              <div className="p-8 border-t bg-slate-50/50 flex justify-between items-center rounded-b-[48px]">
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Final Bill Total</p>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter">₹{selectedOcr?.extracted_data.total_amount.toLocaleString()}</h3>
                 </div>
                 <div className="flex gap-3">
                    <button onClick={() => setView('LIST')} className="px-8 py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest">Discard</button>
                    <button 
                      onClick={handleCommitOcr}
                      className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all"
                    >
                       {selectedOcr?.is_existing ? 'Update Order' : 'Confirm & Post'}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;
