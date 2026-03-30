
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Search, Edit2, Trash2, X, Image as ImageIcon, 
  Utensils, FileSpreadsheet, Upload, Download, CheckCircle, 
  AlertCircle, Loader2, Tag, ChevronRight, Layers, Leaf, Save,
  LayoutGrid, List, Sparkles, Wand2, Power, PowerOff, Info,
  Check, Filter, ArrowUpDown, Percent, IndianRupee, Settings2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { menuService, authService, getSupabase } from '../services/supabaseService';
import { universalAIService } from '../services/UniversalAIService';
import { Modifier } from '../types';

interface MenuManagementProps {
  activeOutlet?: any;
}

const MenuManagement: React.FC<MenuManagementProps> = ({ activeOutlet }) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  
  // Import States
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'success'>('upload');
  const [importData, setImportData] = useState<any[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [itemFormData, setItemFormData] = useState({
    name: '',
    base_price: 0,
    category_id: '',
    is_active: true,
    description: '',
    image_url: '',
    is_veg: true,
    tax_percentage: 5,
    price_includes_tax: false,
    modifiers: [] as Modifier[]
  });

  useEffect(() => {
    loadData();
  }, [activeOutlet?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catData, itemData] = await Promise.all([
        menuService.fetchCategories(activeOutlet?.id),
        menuService.fetchItems(activeOutlet?.id)
      ]);
      setCategories(catData);
      setItems(itemData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const generateAiDescription = async () => {
    if (!itemFormData.name) return alert("Enter a dish name first.");
    setIsGeneratingAi(true);
    try {
      const response = await universalAIService.generateContent({
        prompt: `Create a short, appetizing, 15-word menu description for the dish: "${itemFormData.name}". Focus on texture and flavor.`,
      });
      setItemFormData(prev => ({ ...prev, description: response.text || prev.description }));
    } catch (e) {
      console.error("AI Generation Error", e);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleToggleStock = async (item: any) => {
    try {
      const newStatus = !item.is_active;
      const { error } = await getSupabase()
        .from('menu_items')
        .update({ is_active: newStatus })
        .eq('id', item.id);
      
      if (error) throw error;
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: newStatus } : i));
    } catch (e) {
      alert("Failed to update status.");
    }
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setItemFormData({
      name: item.name,
      base_price: Number(item.base_price),
      category_id: item.category_id || '',
      is_active: item.is_active,
      description: item.description || '',
      image_url: item.image_url || '',
      is_veg: item.is_veg ?? true,
      tax_percentage: Number(item.tax_percentage || 5),
      price_includes_tax: Boolean(item.price_includes_tax ?? false),
      modifiers: item.modifiers || []
    });
    setIsItemModalOpen(true);
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
        const rawData = XLSX.utils.sheet_to_json(ws) as any[];

        let lastKnownCategory = '';
        const processedData = rawData.map(row => {
          const rawCat = (row['Category'] || row['category'] || '').toString().trim();
          if (rawCat !== '') lastKnownCategory = rawCat;

          // Tax Validation
          const rawGst = row['GST %'] || row['Tax %'] || 5;
          const gst = parseFloat(rawGst);
          if (isNaN(gst) || ![0, 5, 12, 18, 28].includes(gst)) {
            throw new Error(`Invalid GST % "${rawGst}" for item "${row['Name']}"`);
          }

          const rawMode = (row['Price Includes Tax'] || row['price_includes_tax'] || 'NO').toString().toUpperCase();
          if (!['YES', 'NO', 'TRUE', 'FALSE'].includes(rawMode)) {
            throw new Error(`Invalid Price Type "${rawMode}" for item "${row['Name']}". Use YES/NO.`);
          }

          return { 
            ...row, 
            resolved_category_name: lastKnownCategory || 'Uncategorized',
            resolved_tax: gst,
            resolved_mode: ['YES', 'TRUE'].includes(rawMode)
          };
        });

        setImportData(processedData);
        setImportStep('preview');
      } catch (err: any) {
        alert(err.message || "Excel parsing failed.");
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
      const client = getSupabase();
      const profile = await authService.getProfile();
      const currentCategories = await menuService.fetchCategories(activeOutlet.id);
      const categoryMap: Record<string, string> = {};
      currentCategories.forEach(c => categoryMap[c.name.toLowerCase().trim()] = c.id);

      const menuRows = [];
      for (const row of importData) {
        const catName = (row.resolved_category_name || 'Uncategorized').trim();
        let catId = categoryMap[catName.toLowerCase()];

        if (!catId) {
          const { data: newCat, error: catErr } = await client
            .from('menu_categories')
            .insert({ name: catName, company_id: profile.company_id, outlet_id: activeOutlet.id })
            .select().single();
          if (catErr) throw catErr;
          catId = newCat.id;
          categoryMap[catName.toLowerCase()] = catId;
        }

        const price = parseFloat(row['Price'] || row['price'] || 0);
        menuRows.push({
          company_id: profile.company_id,
          outlet_id: activeOutlet.id,
          created_by: profile.id,
          name: (row['Name'] || row['name'] || 'Untitled Item').toString(),
          base_price: isNaN(price) ? 0 : price,
          category_id: catId,
          description: (row['Description'] || row['description'] || '').toString(),
          tax_percentage: row.resolved_tax,
          price_includes_tax: row.resolved_mode,
          is_active: true,
          is_veg: true
        });
      }

      const { error } = await client.from('menu_items').insert(menuRows);
      if (error) throw error;

      await loadData();
      setImportStep('success');
    } catch (err: any) {
      alert(`Import Failed: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOutlet?.id) return alert("Select an outlet first.");
    setLoading(true);
    try {
      const client = getSupabase();
      const profile = await authService.getProfile();
      
      const payload = {
        ...itemFormData,
        id: editingItem?.id,
        company_id: profile.company_id,
        outlet_id: activeOutlet.id,
        created_by: profile.id
      };

      const { error } = await client.from('menu_items').upsert(payload);
      if (error) throw error;

      await loadData();
      setIsItemModalOpen(false);
      setEditingItem(null);
      setItemFormData({ name: '', base_price: 0, category_id: '', is_active: true, description: '', image_url: '', is_veg: true, tax_percentage: 5, price_includes_tax: false, modifiers: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Delete this menu item?")) return;
    const client = getSupabase();
    await client.from('menu_items').delete().eq('id', id);
    await loadData();
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.menu_categories?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [items, searchQuery]);

  return (
    <div className="p-8 space-y-8 min-h-screen pb-32 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-orange-600 mb-1">
             <Utensils size={14} />
             <span className="text-[10px] font-black uppercase tracking-widest">Global Menu Repository</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Menu Master</h2>
          {activeOutlet && (
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              Active Scope: {activeOutlet.name}
            </p>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
           <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm shrink-0">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <LayoutGrid size={18} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <List size={18} />
              </button>
           </div>
           <button onClick={() => setIsCategoryModalOpen(true)} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-2xl font-bold shadow-sm hover:bg-slate-50 transition-all shrink-0"><Layers size={18} /> Sections</button>
           <button onClick={() => { setImportStep('upload'); setIsImportModalOpen(true); }} className="flex items-center gap-2 bg-white border border-emerald-200 text-emerald-600 px-6 py-3 rounded-2xl font-bold shadow-sm hover:bg-emerald-50 transition-all shrink-0"><FileSpreadsheet size={18} /> Bulk</button>
           <button onClick={() => { setEditingItem(null); setItemFormData({ name: '', base_price: 0, category_id: '', is_active: true, description: '', image_url: '', is_veg: true, tax_percentage: 5, price_includes_tax: false, modifiers: [] }); setIsItemModalOpen(true); }} className="bg-[#FF6B00] text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 transition-all shrink-0">+ Add Item</button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 transition-colors" size={20} />
          <input 
            type="text" placeholder="Search by dish name or category..." 
            className="w-full pl-12 pr-4 py-4 bg-white rounded-3xl border border-slate-100 shadow-sm outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 text-slate-900 font-bold transition-all" 
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} 
          />
        </div>
        <div className="flex gap-2">
           <button className="px-6 py-4 bg-white border border-slate-100 rounded-3xl text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 shadow-sm">
              <Filter size={16} /> Filter
           </button>
           <button className="px-6 py-4 bg-white border border-slate-100 rounded-3xl text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 shadow-sm">
              <ArrowUpDown size={16} /> Sort
           </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
           <Loader2 className="animate-spin text-orange-500" size={48} />
           <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Contextualizing Menu Data...</p>
        </div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredItems.map(item => (
                <div 
                  key={item.id} 
                  className={`bg-white rounded-[40px] border shadow-sm overflow-hidden flex flex-col group transition-all duration-300 ${!item.is_active ? 'opacity-60 grayscale' : 'hover:shadow-2xl hover:-translate-y-1'}`}
                >
                  <div className="relative h-44 bg-slate-100 overflow-hidden">
                    {item.image_url ? (
                      <img src={item.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-200">
                        <Utensils size={48} />
                      </div>
                    )}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                      <div className={`w-5 h-5 rounded-md border-2 p-1 flex items-center justify-center bg-white ${item.is_veg ? 'border-green-600' : 'border-rose-600'}`}>
                         <div className={`w-2 h-2 rounded-full ${item.is_veg ? 'bg-green-600' : 'bg-rose-600'}`}></div>
                      </div>
                    </div>
                    <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-2xl text-[10px] font-black text-slate-900 shadow-xl border border-white/20">
                      ₹{item.base_price} {item.price_includes_tax ? <span className="text-[7px] text-emerald-500 uppercase ml-0.5">Incl</span> : <span className="text-[7px] text-slate-400 uppercase ml-0.5">Excl</span>}
                    </div>
                    {!item.is_active && (
                       <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center">
                          <span className="px-6 py-2 bg-white text-slate-900 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl">Out of Stock</span>
                       </div>
                    )}
                  </div>
                  
                  <div className="p-8 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-[9px] font-black uppercase text-orange-500 tracking-widest">{item.menu_categories?.name || 'Uncategorized'}</p>
                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">GST {item.tax_percentage}%</span>
                      </div>
                      <h4 className="text-lg font-black text-slate-800 leading-tight line-clamp-1">{item.name}</h4>
                      <p className="text-xs text-slate-400 font-medium line-clamp-2 mt-2 leading-relaxed">{item.description || 'No description provided.'}</p>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                      <div className="flex gap-2">
                        <button onClick={() => handleOpenEdit(item)} className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDeleteItem(item.id)} className="p-3 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <button 
                        onClick={() => handleToggleStock(item)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all ${item.is_active ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                      >
                         {item.is_active ? <Power size={14} /> : <PowerOff size={14} />}
                         {item.is_active ? 'Live' : 'Toggle'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-8 py-5">Dish</th>
                    <th className="px-8 py-5">Section</th>
                    <th className="px-8 py-5">Price</th>
                    <th className="px-8 py-5">GST Rate</th>
                    <th className="px-8 py-5">Pricing Mode</th>
                    <th className="px-8 py-5">Stock Status</th>
                    <th className="px-8 py-5 text-right">Ops</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                   {filteredItems.map(item => (
                     <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors ${!item.is_active && 'opacity-60 bg-slate-50/20'}`}>
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-4">
                              <div className={`w-4 h-4 rounded border-2 p-0.5 flex items-center justify-center shrink-0 ${item.is_veg ? 'border-green-600' : 'border-rose-600'}`}>
                                 <div className={`w-1.5 h-1.5 rounded-full ${item.is_veg ? 'bg-green-600' : 'bg-rose-600'}`}></div>
                              </div>
                              <p className="font-black text-slate-800 text-sm">{item.name}</p>
                           </div>
                        </td>
                        <td className="px-8 py-6">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.menu_categories?.name || '---'}</span>
                        </td>
                        <td className="px-8 py-6">
                           <p className="font-black text-slate-900">₹{item.base_price}</p>
                        </td>
                        <td className="px-8 py-6">
                           <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{item.tax_percentage}%</span>
                        </td>
                        <td className="px-8 py-6">
                           <span className={`text-[10px] font-black uppercase ${item.price_includes_tax ? 'text-emerald-600' : 'text-orange-600'}`}>
                              {item.price_includes_tax ? 'Tax Inclusive' : 'Tax Exclusive'}
                           </span>
                        </td>
                        <td className="px-8 py-6">
                           <button 
                            onClick={() => handleToggleStock(item)}
                            className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}
                           >
                              {item.is_active ? 'In Stock' : 'Out of Stock'}
                           </button>
                        </td>
                        <td className="px-8 py-6 text-right">
                           <div className="flex justify-end gap-2">
                              <button onClick={() => handleOpenEdit(item)} className="p-2 text-slate-300 hover:text-slate-900 transition-colors"><Edit2 size={16} /></button>
                              <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                           </div>
                        </td>
                     </tr>
                   ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Item Creator/Editor Modal */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
           <div className="bg-white rounded-[56px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-orange-500 rounded-3xl flex items-center justify-center shadow-lg">
                       <Utensils size={28} />
                    </div>
                    <div>
                       <h3 className="text-2xl font-black tracking-tight">{editingItem ? 'Edit Dish Card' : 'New Dish Card'}</h3>
                       <p className="text-[10px] font-black uppercase opacity-60">Tax & Price Configuration Registry</p>
                    </div>
                 </div>
                 <button onClick={() => setIsItemModalOpen(false)} className="p-3 hover:bg-white/10 rounded-full transition-all"><X size={28} /></button>
              </div>
              
              <form onSubmit={handleSaveItem} className="flex-1 overflow-y-auto p-12 space-y-10">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Dish Name</label>
                    <input 
                      required className="w-full px-8 py-5 bg-slate-50 border-2 border-transparent focus:border-orange-500 focus:bg-white rounded-[24px] font-black text-slate-900 outline-none transition-all text-lg" 
                      placeholder="e.g. Traditional Paneer Tikka" 
                      value={itemFormData.name} 
                      onChange={e => setItemFormData({...itemFormData, name: e.target.value})} 
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Listing Price (₹)</label>
                       <input 
                        type="number" required 
                        className="w-full px-8 py-5 bg-slate-50 border-2 border-transparent focus:border-orange-500 focus:bg-white rounded-[24px] font-black text-slate-900 outline-none transition-all" 
                        value={itemFormData.base_price} 
                        onChange={e => setItemFormData({...itemFormData, base_price: parseFloat(e.target.value) || 0})} 
                       />
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Section Mapping</label>
                       <select 
                        required className="w-full px-8 py-5 bg-slate-50 border-2 border-transparent focus:border-orange-500 focus:bg-white rounded-[24px] font-black text-slate-900 outline-none transition-all appearance-none" 
                        value={itemFormData.category_id} 
                        onChange={e => setItemFormData({...itemFormData, category_id: e.target.value})}
                       >
                          <option value="">Select Category</option>
                          {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                       </select>
                    </div>
                 </div>

                 {/* NEW TAX SECTION */}
                 <div className="bg-indigo-50/50 p-10 rounded-[40px] space-y-8 border border-indigo-100">
                    <h4 className="text-xs font-black uppercase text-indigo-600 tracking-widest flex items-center gap-2"><Percent size={14} /> Taxation Architecture</h4>
                    <div className="grid grid-cols-2 gap-8">
                       <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GST Rate (%)</label>
                          <select 
                            required
                            className="w-full px-8 py-4 bg-white border-2 border-indigo-100 rounded-2xl font-black text-slate-900 outline-none focus:border-indigo-500 transition-all"
                            value={itemFormData.tax_percentage}
                            onChange={e => setItemFormData({...itemFormData, tax_percentage: parseFloat(e.target.value)})}
                          >
                             {[0, 5, 12, 18, 28].map(v => <option key={v} value={v}>{v}%</option>)}
                          </select>
                       </div>
                       <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pricing Type</label>
                          <div className="flex flex-col gap-2">
                             <label className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${!itemFormData.price_includes_tax ? 'bg-white border-indigo-500 text-indigo-700 shadow-sm' : 'bg-indigo-100/30 border-transparent text-slate-400'}`}>
                                <input 
                                  type="radio" className="hidden" name="pricing_mode" 
                                  checked={!itemFormData.price_includes_tax}
                                  onChange={() => setItemFormData({...itemFormData, price_includes_tax: false})} 
                                />
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${!itemFormData.price_includes_tax ? 'border-indigo-600' : 'border-slate-300'}`}>
                                   {!itemFormData.price_includes_tax && <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>}
                                </div>
                                <span className="font-bold text-xs uppercase tracking-tight">Tax Exclusive</span>
                             </label>
                             <label className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${itemFormData.price_includes_tax ? 'bg-white border-indigo-500 text-indigo-700 shadow-sm' : 'bg-indigo-100/30 border-transparent text-slate-400'}`}>
                                <input 
                                  type="radio" className="hidden" name="pricing_mode"
                                  checked={itemFormData.price_includes_tax}
                                  onChange={() => setItemFormData({...itemFormData, price_includes_tax: true})} 
                                />
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${itemFormData.price_includes_tax ? 'border-indigo-600' : 'border-slate-300'}`}>
                                   {itemFormData.price_includes_tax && <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>}
                                </div>
                                <span className="font-bold text-xs uppercase tracking-tight">Tax Inclusive</span>
                             </label>
                          </div>
                          <p className="text-[9px] text-indigo-400 font-bold leading-tight mt-2 flex items-start gap-1.5">
                             <Info size={10} className="shrink-0 mt-0.5" />
                             Tax Inclusive means the entered price already includes the applicable GST.
                          </p>
                       </div>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Public Description</label>
                       <button 
                        type="button"
                        onClick={generateAiDescription}
                        disabled={isGeneratingAi || !itemFormData.name}
                        className="flex items-center gap-2 px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-indigo-100 shadow-sm hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                       >
                          {isGeneratingAi ? <Loader2 className="animate-spin" size={12} /> : <Sparkles size={12} />}
                          Enhance with Gemini
                       </button>
                    </div>
                    <textarea 
                      className="w-full px-8 py-5 bg-slate-50 border-2 border-transparent focus:border-orange-500 focus:bg-white rounded-[24px] font-bold text-slate-900 outline-none transition-all min-h-[120px]" 
                      placeholder="Enter description or use AI to generate one..."
                      value={itemFormData.description}
                      onChange={e => setItemFormData({...itemFormData, description: e.target.value})}
                    />
                 </div>

                 <div className="bg-slate-50 p-10 rounded-[40px] space-y-8 border border-slate-100">
                    <div className="flex items-center justify-between">
                       <div>
                          <p className="font-black text-slate-900 text-sm">Dietary Classification</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Standard green/red tagging for customers</p>
                       </div>
                       <button 
                        type="button"
                        onClick={() => setItemFormData({...itemFormData, is_veg: !itemFormData.is_veg})}
                        className={`px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${itemFormData.is_veg ? 'bg-green-600 text-white shadow-xl shadow-green-100' : 'bg-rose-600 text-white shadow-xl shadow-rose-100'}`}
                       >
                          {itemFormData.is_veg ? 'Pure Vegetarian' : 'Non-Vegetarian'}
                       </button>
                    </div>
                 </div>

                 <div className="pt-6">
                    <button type="submit" disabled={loading} className="w-full py-7 bg-slate-900 text-white rounded-[32px] font-black uppercase tracking-widest text-sm shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                       {loading ? <Loader2 className="animate-spin" size={24} /> : <><Check size={20} /> Deploy to Digital Menu</>}
                    </button>
                 </div>
                  {/* MODIFIERS SECTION */}
                  <div className="bg-orange-50/50 p-10 rounded-[40px] space-y-8 border border-orange-100">
                     <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase text-orange-600 tracking-widest flex items-center gap-2"><Settings2 size={14} /> Item Modifiers</h4>
                        <button 
                          type="button"
                          onClick={() => setItemFormData({
                            ...itemFormData, 
                            modifiers: [...itemFormData.modifiers, { id: Math.random().toString(36).substr(2, 9), name: '', price: 0, is_active: true }]
                          })}
                          className="px-4 py-2 bg-orange-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-orange-700 transition-all"
                        >
                           + Add Modifier
                        </button>
                     </div>
                     <div className="space-y-4">
                        {itemFormData.modifiers.length === 0 ? (
                          <p className="text-[10px] text-orange-400 font-bold uppercase text-center py-4 border-2 border-dashed border-orange-200 rounded-3xl">No modifiers defined for this item</p>
                        ) : itemFormData.modifiers.map((mod, idx) => (
                          <div key={mod.id} className="flex gap-4 items-center bg-white p-4 rounded-2xl border border-orange-100 shadow-sm animate-in slide-in-from-left-2">
                             <div className="flex-1">
                                <input 
                                  placeholder="Modifier Name (e.g. Extra Cheese)"
                                  className="w-full bg-transparent border-b border-slate-100 focus:border-orange-500 outline-none font-bold text-sm text-slate-800 py-1"
                                  value={mod.name}
                                  onChange={e => {
                                    const newMods = [...itemFormData.modifiers];
                                    newMods[idx].name = e.target.value;
                                    setItemFormData({...itemFormData, modifiers: newMods});
                                  }}
                                />
                             </div>
                             <div className="w-24">
                                <input 
                                  type="number"
                                  placeholder="Price"
                                  className="w-full bg-transparent border-b border-slate-100 focus:border-orange-500 outline-none font-black text-sm text-slate-800 py-1 text-right"
                                  value={mod.price}
                                  onChange={e => {
                                    const newMods = [...itemFormData.modifiers];
                                    newMods[idx].price = parseFloat(e.target.value) || 0;
                                    setItemFormData({...itemFormData, modifiers: newMods});
                                  }}
                                />
                             </div>
                             <button 
                               type="button"
                               onClick={() => {
                                 const newMods = itemFormData.modifiers.filter((_, i) => i !== idx);
                                 setItemFormData({...itemFormData, modifiers: newMods});
                               }}
                               className="p-2 text-rose-400 hover:text-rose-600 transition-colors"
                             >
                                <Trash2 size={16} />
                             </button>
                          </div>
                        ))}
                     </div>
                  </div>
               </form>
           </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
           <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
              <div className="p-8 bg-emerald-600 text-white flex justify-between items-center">
                 <h3 className="text-xl font-black">Bulk Data Pipeline</h3>
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
                            <p className="text-lg font-black text-slate-800">Upload Catalog Excel</p>
                            <p className="text-sm text-slate-400 font-medium">Accepts .xlsx, .csv</p>
                         </div>
                         <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
                      </div>
                      <div className="p-6 bg-slate-50 rounded-3xl text-[10px] font-bold text-slate-400 uppercase text-center max-w-md leading-relaxed border border-slate-100">
                         <p className="font-black text-slate-600 mb-2">Column Headers Supported:</p>
                         Name, Price, Category, Description, GST %, Price Includes Tax (YES/NO)
                      </div>
                   </div>
                 )}
                 {importStep === 'preview' && (
                   <div className="space-y-6">
                      <p className="text-sm font-bold text-slate-500">Scanning {importData.length} records for ingestion.</p>
                      <div className="bg-slate-50 rounded-2xl overflow-x-auto max-h-60 border border-slate-100">
                         <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 font-black uppercase text-slate-400">
                               <tr><th className="p-4">Name</th><th className="p-4">Price</th><th className="p-4">Tax %</th><th className="p-4">Inclusive?</th><th className="p-4">Resolved Category</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                               {importData.slice(0, 10).map((row, i) => (
                                 <tr key={i}>
                                   <td className="p-4 font-bold">{row.Name || row.name}</td>
                                   <td className="p-4 font-black text-emerald-600">₹{row.Price || row.price}</td>
                                   <td className="p-4 font-bold text-indigo-600">{row.resolved_tax}%</td>
                                   <td className="p-4 font-bold">{row.resolved_mode ? 'YES' : 'NO'}</td>
                                   <td className="p-4 text-slate-400">{row.resolved_category_name}</td>
                                 </tr>
                               ))}
                               {importData.length > 10 && <tr><td colSpan={5} className="p-4 text-center text-slate-300 font-bold italic">...and {importData.length - 10} more items</td></tr>}
                            </tbody>
                         </table>
                      </div>
                      <button onClick={executeImport} disabled={isParsing} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all">
                        {isParsing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />} Commit Records
                      </button>
                   </div>
                 )}
                 {importStep === 'success' && (
                   <div className="text-center py-10 space-y-6">
                      <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><CheckCircle size={40} /></div>
                      <h4 className="text-2xl font-black text-slate-900">Ingestion Complete!</h4>
                      <button onClick={() => setIsImportModalOpen(false)} className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Back to Inventory</button>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default MenuManagement;
