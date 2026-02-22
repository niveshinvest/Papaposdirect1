
import React, { useState, useEffect } from 'react';
import { Outlet, OutletType } from '../types';
import { 
  MapPin, Plus, Store, Warehouse, ShieldCheck, 
  X, Edit2, Trash2, User, Building2, Phone, 
  Hash, CreditCard, ChevronRight, Search, Info, Loader2, Cloud, AlertTriangle
} from 'lucide-react';
import { cloudOutlets } from '../services/supabaseService';
import { db } from '../services/db';

const INDIAN_STATES = [
  { code: '27', name: 'Maharashtra' },
  { code: '07', name: 'Delhi' },
  { code: '29', name: 'Karnataka' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '19', name: 'West Bengal' },
  { code: '36', name: 'Telangana' },
  { code: '24', name: 'Gujarat' }
];

const Outlets: React.FC = () => {
  const [outlets, setOutlets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<any | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'SHOP' as OutletType,
    location: '',
    address: '',
    city: '',
    pincode: '',
    state: 'Maharashtra',
    state_code: '27',
    contactPerson: '',
    phoneNumber: '',
    gst_number: '',
    gst_registered: false,
    gst_state_code: '27'
  });

  useEffect(() => {
    loadOutlets();
  }, []);

  const loadOutlets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await cloudOutlets.fetchAll();
      setOutlets(data);
      // SYNC: Update local storage with cloud truth
      if (data) {
        await db.outlets.bulkPut(data.map(o => ({ ...o, syncStatus: 'synced' })));
      }
    } catch (e: any) {
      console.error("Direct fetch failed", e);
      if (e.code === '42P01' || e.code === 'PGRST204') {
        setError("Cloud schema is out of sync. Please apply pending migrations in Settings > Migration.");
      } else {
        setError(`Connection error: ${e.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (outlet?: any) => {
    if (outlet) {
      setEditingOutlet(outlet);
      setFormData({
        name: outlet.name,
        type: outlet.type,
        location: outlet.location,
        address: outlet.address || '',
        city: outlet.city || '',
        pincode: outlet.pincode || '',
        state: outlet.state || 'Maharashtra',
        state_code: outlet.state_code || '27',
        contactPerson: outlet.contactPerson || '',
        phoneNumber: outlet.phoneNumber || '',
        gst_number: outlet.gst_number || '',
        gst_registered: outlet.gst_registered || false,
        gst_state_code: outlet.gst_state_code || outlet.state_code || '27'
      });
    } else {
      setEditingOutlet(null);
      setFormData({
        name: '',
        type: 'SHOP',
        location: '',
        address: '',
        city: '',
        pincode: '',
        state: 'Maharashtra',
        state_code: '27',
        contactPerson: '',
        phoneNumber: '',
        gst_number: '',
        gst_registered: false,
        gst_state_code: '27'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.gst_registered && !formData.gst_number) {
      alert("GST Number is mandatory if GST Registered is enabled.");
      return;
    }

    setLoading(true);
    const id = editingOutlet?.id || `OUT-${Date.now()}`;
    
    const outletPayload = {
      id,
      name: formData.name,
      type: formData.type,
      location: formData.location,
      address: formData.address,
      city: formData.city,
      pincode: formData.pincode,
      state: formData.state,
      state_code: formData.state_code,
      contactPerson: formData.contactPerson,
      phoneNumber: formData.phoneNumber,
      gst_number: formData.gst_registered ? formData.gst_number : null,
      gst_registered: formData.gst_registered,
      gst_state_code: formData.gst_registered ? formData.gst_state_code : null,
      subscriptionActive: true
    };

    try {
      await cloudOutlets.upsert(outletPayload);
      
      // CRITICAL FIX: Mirror the change to local storage immediately
      await db.outlets.put({
         ...outletPayload,
         syncStatus: 'synced'
      } as any);

      await loadOutlets();
      setIsModalOpen(false);
    } catch (err: any) {
      console.error("Save failed", err);
      if (err.code === 'PGRST204') {
        alert("The database is missing required columns (phoneNumber). Please go to Settings > Migration and apply v4.");
      } else if (err.code === '42P01') {
        alert("Tables not found. Go to Settings > Migration and click 'Apply Migration'.");
      } else {
        alert(`Cloud save failed: ${err.message}. Check credentials.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this outlet from Cloud?")) return;
    setLoading(true);
    try {
      await cloudOutlets.delete(id);
      await db.outlets.delete(id);
      await loadOutlets();
    } catch (e) {
      alert("Deletion failed.");
    } finally {
      setLoading(false);
    }
  };

  const filteredOutlets = outlets.filter(o => 
    (o.name?.toLowerCase().includes(searchQuery.toLowerCase())) || 
    (o.location?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-8 space-y-8 min-h-screen pb-32 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
             <Cloud size={16} />
             <span className="text-[10px] font-black uppercase tracking-widest">Direct Cloud Native</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Chain Master</h2>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search outlets..."
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold w-64 outline-none focus:ring-2 focus:ring-orange-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-[#FF6B00] text-white px-8 py-3 rounded-xl font-black shadow-xl hover:scale-105 transition-all"
          >
            <Plus size={20} /> New Outlet
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 p-6 rounded-3xl flex items-center gap-4 text-red-700 animate-in fade-in">
           <AlertTriangle className="shrink-0" size={24} />
           <div className="flex-1">
              <p className="font-black uppercase text-xs tracking-widest">Database Sync Error</p>
              <p className="text-sm font-medium mt-1">{error}</p>
           </div>
           <button onClick={loadOutlets} className="px-4 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">Retry</button>
        </div>
      )}

      {loading && outlets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
           <Loader2 className="animate-spin text-orange-500" size={48} />
           <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Querying Supabase...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredOutlets.length === 0 && !error ? (
            <div className="col-span-full py-20 bg-white rounded-[40px] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 space-y-4">
              <Store size={48} className="opacity-20" />
              <p className="font-black uppercase text-xs tracking-widest">No cloud outlets found</p>
            </div>
          ) : (
            filteredOutlets.map((outlet) => {
              const gst = outlet.outlet_gst?.[0];
              return (
                <div key={outlet.id} onClick={() => setSelectedId(outlet.id)} className={`bg-white rounded-[40px] border shadow-sm overflow-hidden flex flex-col group hover:shadow-2xl transition-all duration-300 cursor-pointer ${selectedId === outlet.id ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-slate-100'}`}>
                  <div className="p-8 space-y-6">
                    <div className="flex justify-between items-start">
                      <div className={`p-5 rounded-[24px] shadow-lg ${outlet.type === 'GODOWN' ? 'bg-indigo-600 text-white' : 'bg-orange-600 text-white'}`}>
                        {outlet.type === 'GODOWN' ? <Warehouse size={32} /> : <Store size={32} />}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                         <span className="px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700">
                            Verified Cloud
                         </span>
                         <div className="flex gap-2 mt-2">
                            <button onClick={(e) => { e.stopPropagation(); handleOpenModal(outlet); }} className="p-2.5 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-xl transition-all border border-slate-100"><Edit2 size={16} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(outlet.id); }} className="p-2.5 bg-slate-50 text-slate-400 hover:text-rose-600 rounded-xl transition-all border border-slate-100"><Trash2 size={16} /></button>
                         </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-2xl font-black text-slate-900 leading-tight">{outlet.name}</h3>
                      <p className="text-sm text-slate-400 font-bold flex items-center gap-1.5 mt-1">
                        <MapPin size={14} /> {outlet.city || 'Location unset'}, {outlet.state || 'India'}
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                         <Hash size={18} className="text-slate-400" />
                         <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">GSTIN</p>
                            <p className="font-bold text-slate-800 text-sm truncate">{outlet.gst_registered ? (outlet.gst_number || 'PENDING') : 'UNREGISTERED'}</p>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
           <div className="bg-white rounded-[48px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <h3 className="text-2xl font-black tracking-tight">{editingOutlet ? 'Modify Registration' : 'New Registration'}</h3>
                 <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={24} /></button>
              </div>
              
              <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-10 space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Business Name</label>
                       <input 
                        type="text" required
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none" 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</label>
                       <select 
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                        value={formData.type}
                        onChange={e => setFormData({...formData, type: e.target.value as OutletType})}
                       >
                          <option value="SHOP">Retail / Restaurant</option>
                          <option value="GODOWN">Warehouse</option>
                       </select>
                    </div>
                 </div>

                 <div className="bg-orange-50/50 rounded-3xl p-8 space-y-6 border border-orange-100">
                    <div className="flex items-center justify-between">
                       <h4 className="font-black uppercase tracking-widest text-xs text-orange-600">Tax Compliance (GST) & Contact</h4>
                       <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GST Registered?</span>
                          <button 
                            type="button"
                            onClick={() => setFormData({...formData, gst_registered: !formData.gst_registered})}
                            className={`w-12 h-6 rounded-full transition-all relative ${formData.gst_registered ? 'bg-orange-500' : 'bg-slate-300'}`}
                          >
                             <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.gst_registered ? 'left-7' : 'left-1'}`} />
                          </button>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       {formData.gst_registered && (
                         <>
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GSTIN Number</label>
                              <input 
                                type="text"
                                required={formData.gst_registered}
                                className="w-full px-6 py-4 bg-white border border-orange-100 rounded-2xl font-mono font-bold" 
                                placeholder="27AAAAA0000A1Z5"
                                value={formData.gst_number}
                                onChange={e => setFormData({...formData, gst_number: e.target.value.toUpperCase()})}
                              />
                           </div>
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GST State Code</label>
                              <select 
                                className="w-full px-6 py-4 bg-white border border-orange-100 rounded-2xl font-bold"
                                value={formData.gst_state_code}
                                onChange={e => setFormData({...formData, gst_state_code: e.target.value})}
                              >
                                 {INDIAN_STATES.map(s => <option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}
                              </select>
                           </div>
                         </>
                       )}
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone Number</label>
                          <input 
                            type="tel"
                            className="w-full px-6 py-4 bg-white border border-orange-100 rounded-2xl font-bold" 
                            placeholder="+91 00000 00000"
                            value={formData.phoneNumber}
                            onChange={e => setFormData({...formData, phoneNumber: e.target.value})}
                          />
                       </div>
                    </div>
                 </div>

                 <div className="space-y-6">
                    <h4 className="font-black uppercase tracking-widest text-xs text-slate-400">Location Mapping</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">State (Place of Supply)</label>
                          <select 
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold"
                            value={formData.state_code}
                            onChange={e => {
                              const state = INDIAN_STATES.find(s => s.code === e.target.value);
                              setFormData({...formData, state_code: e.target.value, state: state?.name || ''});
                            }}
                          >
                             {INDIAN_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                          </select>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">City</label>
                          <input 
                            type="text" placeholder="City"
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" 
                            value={formData.city}
                            onChange={e => setFormData({...formData, city: e.target.value})}
                          />
                       </div>
                    </div>
                 </div>
                 
                 <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-sm shadow-2xl flex items-center justify-center gap-2"
                 >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : 'Push to Cloud Database'}
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default Outlets;
