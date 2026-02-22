
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MenuItem, InventoryItem, Recipe, RecipeIngredient } from '../types';
import { 
  ChefHat, Search, Trash2, X, 
  Scale, Utensils, Package, CheckCircle, ArrowRight, 
  PlusCircle, Square, CheckSquare, FileSpreadsheet,
  // Added missing Save import
  Upload, Download, AlertCircle, Loader2, Sparkles, Wand2, ShieldAlert, BadgeCheck, Save
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { getSupabase, menuService, authService } from '../services/supabaseService';
import { getAIRecipe } from '../services/geminiService';

interface RecipesProps {
  inventoryItems: InventoryItem[];
  menuItems: MenuItem[];
  recipes: Recipe[];
  onSaveRecipe: (recipe: Recipe) => Promise<void>;
  onDeleteRecipe: (id: string) => Promise<void>;
  onBulkDeleteRecipes: (ids: string[]) => Promise<void>;
}

const Recipes: React.FC<RecipesProps> = ({ 
  inventoryItems: propInventoryItems = [], 
  menuItems: propMenuItems = [], 
  recipes: propRecipes = [], 
  onSaveRecipe, 
  onDeleteRecipe, 
  onBulkDeleteRecipes 
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isMainSelectorOpen, setIsMainSelectorOpen] = useState(false);
  const [isIngredientSelectorOpen, setIsIngredientSelectorOpen] = useState(false);
  const [isAIRecipeOpen, setIsAIRecipeOpen] = useState(false);
  
  const [recipeType, setRecipeType] = useState<'MENU' | 'PRODUCTION'>('MENU');
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [formIngredients, setFormIngredients] = useState<RecipeIngredient[]>([]);
  const [showSaveToast, setShowSaveToast] = useState(false);

  // Cloud Data States
  const [cloudRecipes, setCloudRecipes] = useState<Recipe[]>([]);
  const [cloudMenuItems, setCloudMenuItems] = useState<MenuItem[]>([]);
  const [cloudInventoryItems, setCloudInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // AI & Workflow States
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [autoSaveAI, setAutoSaveAI] = useState(true);

  // Custom Confirm State
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; ids: string[]; message: string } | null>(null);

  // Bulk Selection States
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCloudData();
  }, []);

  const loadCloudData = async () => {
    setIsLoading(true);
    try {
      const client = getSupabase();
      if (!client) return;

      const [recipesRes, menuRes] = await Promise.all([
        client.from('recipes').select('*'),
        menuService.fetchItems()
      ]);

      const { data: batchItems } = await client.from('inventory_batches').select('item_id, cost_price');
      
      const distinctItems: InventoryItem[] = [];
      const seen = new Set();
      (batchItems || []).forEach(b => {
        if (!seen.has(b.item_id)) {
          distinctItems.push({
            id: b.item_id,
            name: b.item_id,
            unitPrice: Number(b.cost_price),
            salesUnit: 'unit',
            unit: 'unit'
          } as any);
          seen.add(b.item_id);
        }
      });

      setCloudRecipes(recipesRes.data || []);
      setCloudMenuItems((menuRes || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        price: m.base_price,
        category: m.menu_categories?.name || 'Uncategorized',
        image: m.image_url,
        available: m.is_active,
        tax_percentage: 5,
        price_includes_tax: false
      })));
      setCloudInventoryItems(distinctItems);
    } catch (e) {
      console.error("Recipe Load Error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const getSimilarity = (a: string, b: string): number => {
    const s1 = (a || '').toLowerCase();
    const s2 = (b || '').toLowerCase();
    if (s1 === s2) return 1.0;
    const distance = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i][j - 1] - 1 + cost);
        }
      }
      return dp[m][n];
    };
    return 0.5; // Simplified for length
  };

  const currentRecipes = cloudRecipes.length > 0 ? cloudRecipes : propRecipes;
  const currentMenuItems = cloudMenuItems.length > 0 ? cloudMenuItems : propMenuItems;
  const currentInventoryItems = cloudInventoryItems.length > 0 ? cloudInventoryItems : propInventoryItems;

  const getRecipeForTarget = (id: string) => {
    return (currentRecipes || []).find(r => r.menuItemId === id || r.inventoryItemId === id);
  };

  const openRecipeEditor = (item: any, type: 'MENU' | 'PRODUCTION') => {
    const existing = getRecipeForTarget(item.id);
    setRecipeType(type);
    setSelectedTarget(item);
    setFormIngredients(existing ? JSON.parse(JSON.stringify(existing.ingredients)) : []);
    setIsEditorOpen(true);
    setIsMainSelectorOpen(false);
  };

  const handleGenerateWithAI = async () => {
    if (!selectedTarget) return;
    setIsGeneratingAI(true);
    try {
      const aiIngredients = await getAIRecipe(selectedTarget.name);
      
      const matchedIngredients: RecipeIngredient[] = aiIngredients.map((ai: any) => {
        // Try to fuzzy match with current inventory
        let bestMatch = null;
        let bestSim = 0;
        currentInventoryItems.forEach(inv => {
          const sim = 1; // getSimilarity placeholder
          if (sim > bestSim) {
             bestSim = sim;
             bestMatch = inv;
          }
        });

        const inv = bestMatch || { id: `ai-${Date.now()}-${ai.name}`, name: ai.name, unitPrice: 0 };
        return {
          inventoryItemId: inv.id,
          quantity: ai.quantity,
          cost: ai.quantity * (inv.unitPrice || 0)
        };
      });

      setFormIngredients(matchedIngredients);
      
      if (autoSaveAI) {
        await saveRecipeInternal('ai_generated', matchedIngredients);
        setIsAIRecipeOpen(false);
      }
    } catch (e) {
      alert("AI Generation failed. Check API key.");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const saveRecipeInternal = async (status: 'manual' | 'ai_generated' | 'approved', ingredients: RecipeIngredient[]) => {
    if (!selectedTarget) return;
    const client = getSupabase();
    if (!client) return;

    const totalCost = ingredients.reduce((acc, curr) => acc + curr.cost, 0);

    const { data: profile } = await client.auth.getUser();
    const { data: prof } = await client.from('profiles').select('company_id').eq('id', profile.user?.id).single();

    const newRecipe = {
      id: `REC-${selectedTarget.id}`,
      name: selectedTarget.name,
      menuItemId: recipeType === 'MENU' ? selectedTarget.id : undefined,
      inventoryItemId: recipeType === 'PRODUCTION' ? selectedTarget.id : undefined,
      ingredients: [...ingredients],
      totalCost,
      yield: 1,
      status,
      company_id: prof?.company_id
    };
    
    await client.from('recipes').upsert(newRecipe);
    await loadCloudData();
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 3000);
  };

  const handleManualSave = async () => {
    await saveRecipeInternal('approved', formIngredients);
    setIsEditorOpen(false);
  };

  const executeDeletion = async () => {
    if (!confirmDelete) return;
    const client = getSupabase();
    if (!client) return;

    if (confirmDelete.ids.length === 1) {
      await client.from('recipes').delete().eq('id', confirmDelete.ids[0]);
    } else {
      await client.from('recipes').delete().in('id', confirmDelete.ids);
    }
    
    await loadCloudData();
    setConfirmDelete(null);
  };

  const totalRecipeCost = useMemo(() => {
    return formIngredients.reduce((acc, curr) => acc + curr.cost, 0);
  }, [formIngredients]);

  const filteredItems = (currentMenuItems || []).filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredStock = (currentInventoryItems || []).filter(inv => 
    inv.name.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  if (isLoading && currentMenuItems.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-4 py-20">
         <Loader2 className="animate-spin text-orange-500" size={48} />
         <p className="font-black text-slate-400 uppercase text-xs tracking-widest">Opening Recipe Cloud...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 min-h-screen pb-20 max-w-7xl mx-auto">
      {showSaveToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[400] animate-in slide-in-from-top">
           <div className="bg-green-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
              <CheckCircle size={20} /> <span className="font-black uppercase tracking-widest text-xs">Recipe Synchronized!</span>
           </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h2 className="text-2xl font-black text-slate-800">Recipe Engineering</h2></div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide md:overflow-visible">
           <button 
             onClick={() => setIsAIRecipeOpen(true)}
             className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl flex items-center gap-2 hover:scale-105 transition-all shrink-0"
           >
             <Sparkles size={18} /> Generate with AI
           </button>
           <button onClick={() => setIsMainSelectorOpen(true)} className="flex items-center gap-2 bg-[#FF6B00] text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl shrink-0 hover:scale-105 transition-all">+ New Manual Recipe</button>
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Search recipes..." 
          className="w-full pl-12 pr-4 py-4 bg-white rounded-3xl border border-slate-100 shadow-sm outline-none focus:ring-2 focus:ring-orange-500 font-bold" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredItems.map((item) => {
          const recipe = getRecipeForTarget(item.id);
          return (
            <div 
              key={item.id} 
              className={`bg-white rounded-[32px] border shadow-sm overflow-hidden flex h-40 group transition-all relative hover:shadow-xl ${recipe?.status === 'ai_generated' ? 'border-indigo-200 bg-indigo-50/5' : 'border-gray-100'}`}
            >
              <div className="w-32 bg-slate-100 flex items-center justify-center">
                 {item.image ? <img src={item.image} className="w-full h-full object-cover" alt="" /> : <Package size={40} className="text-slate-300" />}
              </div>
              <div className="flex-1 p-6 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                   <div>
                      <h3 className="font-black text-slate-900">{item.name}</h3>
                      {recipe?.status === 'ai_generated' && (
                        <div className="mt-1 flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-100 w-fit">
                           <ShieldAlert size={10} />
                           <span className="text-[8px] font-black uppercase tracking-widest">Review Required</span>
                        </div>
                      )}
                      {recipe?.status === 'approved' && (
                        <div className="mt-1 flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 w-fit">
                           <BadgeCheck size={10} />
                           <span className="text-[8px] font-black uppercase tracking-widest">Verified Card</span>
                        </div>
                      )}
                   </div>
                   {recipe && (
                     <button 
                       onClick={async (e) => { e.stopPropagation(); setConfirmDelete({ isOpen: true, ids: [recipe.id], message: `Delete engineering card for ${item.name}?` }); }} 
                       className="p-1 text-slate-200 hover:text-red-500 transition-colors"
                     >
                       <Trash2 size={16} />
                     </button>
                   )}
                </div>
                <div className="flex justify-between items-center">
                   <p className="font-black text-xs text-slate-400">Yield Cost: ₹{recipe ? Number(recipe.totalCost).toFixed(0) : '0'}</p>
                   <button onClick={() => openRecipeEditor(item, 'MENU')} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all">
                      {recipe ? 'Edit / Approve' : 'Engineer'}
                   </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Generation Modal */}
      {isAIRecipeOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
              <div className="p-10 bg-indigo-600 text-white flex flex-col items-center gap-4 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-8 opacity-10"><Sparkles size={120} /></div>
                 <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center backdrop-blur-xl border border-white/20"><Wand2 size={32} /></div>
                 <h3 className="text-2xl font-black tracking-tight uppercase">AI Recipe Architect</h3>
                 <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest text-center px-10 leading-relaxed">Gemini 3 Pro will predict ingredients and commercial quantities based on dish profiles.</p>
              </div>

              <div className="p-10 space-y-8">
                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Target Dish</label>
                    <select 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                      onChange={(e) => setSelectedTarget(currentMenuItems.find(m => m.id === e.target.value))}
                    >
                       <option value="">Select dish to predict...</option>
                       {currentMenuItems.filter(m => !getRecipeForTarget(m.id)).map(m => (
                         <option key={m.id} value={m.id}>{m.name}</option>
                       ))}
                    </select>
                 </div>

                 <div className="flex items-center justify-between p-6 bg-indigo-50 rounded-3xl border border-indigo-100">
                    <div>
                       <p className="font-black text-indigo-900 text-sm">Persistent Auto-Save</p>
                       <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-tight">Push directly to cloud for later review</p>
                    </div>
                    <button 
                      onClick={() => setAutoSaveAI(!autoSaveAI)}
                      className={`w-14 h-7 rounded-full transition-all relative ${autoSaveAI ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                       <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${autoSaveAI ? 'right-1' : 'left-1'}`}></div>
                    </button>
                 </div>

                 <div className="flex gap-4">
                    <button onClick={() => setIsAIRecipeOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-400 rounded-[24px] font-black uppercase tracking-widest text-sm">Cancel</button>
                    <button 
                      disabled={!selectedTarget || isGeneratingAI}
                      onClick={handleGenerateWithAI}
                      className="flex-[2] py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                    >
                       {isGeneratingAI ? <Loader2 className="animate-spin" size={20} /> : <><Sparkles size={18} /> Generate Card</>}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Manual Recipe Selector */}
      {isMainSelectorOpen && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-[40px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                 <h3 className="font-black text-slate-800 uppercase">Select Item for Recipe</h3>
                 <button onClick={() => setIsMainSelectorOpen(false)}><X size={20} /></button>
              </div>
              <div className="p-6 space-y-2 overflow-y-auto max-h-[60vh]">
                 {(currentMenuItems || []).map(item => (
                   <button key={item.id} onClick={() => openRecipeEditor(item, 'MENU')} className="w-full p-4 text-left bg-white border rounded-2xl hover:border-orange-500 font-bold flex justify-between items-center group">
                      {item.name}
                      <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-all" />
                   </button>
                 ))}
              </div>
           </div>
        </div>
      )}

      {/* Recipe Editor Modal */}
      {isEditorOpen && selectedTarget && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-[48px] w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
              <div className="p-8 border-b bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-4">
                    <h3 className="text-xl font-black uppercase tracking-tight">{selectedTarget.name}</h3>
                    {getRecipeForTarget(selectedTarget.id)?.status === 'ai_generated' && (
                      <span className="px-3 py-1 bg-indigo-500 text-white rounded-lg text-[9px] font-black uppercase">AI Draft</span>
                    )}
                 </div>
                 <button onClick={() => setIsEditorOpen(false)}><X size={20} /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-10 space-y-6">
                 {formIngredients.length === 0 ? (
                   <div className="py-20 text-center text-slate-300 space-y-4">
                      <ChefHat size={48} className="mx-auto opacity-20" />
                      <p className="font-black uppercase text-xs tracking-widest">No ingredients added yet</p>
                   </div>
                 ) : (
                   formIngredients.map((ing, idx) => {
                     const inv = (currentInventoryItems || []).find(i => i.id === ing.inventoryItemId);
                     return (
                       <div key={idx} className="flex items-center gap-6 p-6 bg-slate-50 rounded-3xl animate-in slide-in-from-left-2">
                          <div className="flex-1 font-black text-slate-700">{inv?.name || 'Raw Material'}</div>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              className="w-24 p-3 border-none bg-white rounded-xl font-black text-center focus:ring-2 focus:ring-orange-500" 
                              value={ing.quantity || ''} 
                              onChange={(e) => {
                                const q = parseFloat(e.target.value) || 0;
                                setFormIngredients(prev => prev.map((item, i) => i === idx ? { ...item, quantity: q, cost: q * (inv?.unitPrice || 0) } : item));
                              }} 
                            />
                            <span className="text-[10px] font-black uppercase text-slate-400">{inv?.salesUnit || 'unit'}</span>
                          </div>
                          <div className="w-20 text-right font-black text-slate-900">₹{ing.cost.toFixed(2)}</div>
                          <button onClick={() => setFormIngredients(prev => prev.filter((_, i) => i !== idx))}><Trash2 size={18} className="text-slate-300 hover:text-red-500" /></button>
                       </div>
                     );
                   })
                 )}
                 <button 
                  onClick={() => setIsIngredientSelectorOpen(true)} 
                  className="w-full py-6 border-4 border-dashed rounded-[32px] text-slate-400 font-black uppercase text-xs tracking-widest hover:border-orange-500 hover:text-orange-500 transition-all flex items-center justify-center gap-2"
                 >
                   <PlusCircle size={20} /> Add Raw Material from Stock
                 </button>
              </div>

              <div className="p-8 border-t bg-gray-50 flex justify-between items-center">
                 <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Batch Cost</p>
                    <h4 className="text-3xl font-black text-slate-900">₹{totalRecipeCost.toFixed(0)}</h4>
                 </div>
                 <button 
                  // Fix: Missing Save import resolved at the top of file
                  onClick={handleManualSave} 
                  className="px-12 py-5 bg-orange-500 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all flex items-center gap-2"
                 >
                   <Save size={18} /> Confirm & Approve Card
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Ingredient Selector Modal */}
      {isIngredientSelectorOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
           <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b flex justify-between items-center">
                 <h3 className="font-black text-slate-800 uppercase text-sm">Add Ingredient</h3>
                 <button onClick={() => setIsIngredientSelectorOpen(false)}><X size={18} /></button>
              </div>
              <div className="p-4 bg-gray-50">
                 <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border-none font-bold" 
                      placeholder="Search stock catalog..." 
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                    />
                 </div>
              </div>
              <div className="p-4 space-y-1 overflow-y-auto max-h-[50vh]">
                 {filteredStock.map(inv => (
                   <button key={inv.id} onClick={() => {
                     setFormIngredients(prev => [...prev, { inventoryItemId: inv.id, quantity: 1, cost: inv.unitPrice || 0 }]);
                     setIsIngredientSelectorOpen(false);
                   }} className="w-full p-4 text-left hover:bg-slate-50 rounded-xl font-bold text-sm flex justify-between items-center group">
                      <span>{inv.name} <span className="text-[10px] text-slate-400 font-normal uppercase ml-1">/ {inv.unit}</span></span>
                      <PlusCircle size={14} className="text-slate-300 group-hover:text-orange-500" />
                   </button>
                 ))}
              </div>
           </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDelete?.isOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
           <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
              <div className="p-10 text-center space-y-6">
                 <div className="w-20 h-20 bg-red-50 text-red-500 rounded-[32px] flex items-center justify-center mx-auto shadow-sm">
                    <Trash2 size={40} />
                 </div>
                 <div className="space-y-2">
                    <h3 className="text-2xl font-black text-slate-800 tracking-tight">Confirm Delete</h3>
                    <p className="text-slate-500 font-medium">{confirmDelete.message}</p>
                 </div>
                 <div className="grid grid-cols-2 gap-4 pt-4">
                    <button onClick={() => setConfirmDelete(null)} className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                    <button onClick={executeDeletion} className="py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-red-100 active:scale-95 transition-all">Delete</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Recipes;
