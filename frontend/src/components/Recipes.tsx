
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChefHat, Search, Trash2, X, 
  CheckCircle, ArrowRight, 
  PlusCircle, Loader2, Sparkles, Wand2, ShieldAlert, BadgeCheck, Save,
  Clock, Lock, CheckSquare, Edit3, Plus, Minus
} from 'lucide-react';
import { menuService, getSupabase, inventoryService } from '../services/supabaseService';
import { recipeService, RecipeEntry, RecipeStatus } from '../services/recipeService';
import { Outlet, MenuItem } from '../types';

interface RecipesProps {
  activeOutlet: Outlet | null;
}

const Recipes: React.FC<RecipesProps> = ({ activeOutlet }) => {
  const [groupedRecipes, setGroupedRecipes] = useState<Record<RecipeStatus, RecipeEntry[]>>({
    DRAFT: [],
    QUEUED: [],
    FINALIZED: [],
    REJECTED: []
  });
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isAIRecipeOpen, setIsAIRecipeOpen] = useState(false);
  const [isManualRecipeOpen, setIsManualRecipeOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<MenuItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // FIX START
  const [inventoryItems, setInventoryItems] = useState<{id: string, name: string}[]>([]);
  // FIX END

  // Manual Form State
  const [manualForm, setManualForm] = useState({
    menuitemid:'',
    itemname:'',
    outletid:'',
    ingredients: [{ inventoryItemId: '', name: '', quantity: 0, unit: 'gram', cost: 0 }],
    steps: [''],
    yield: 1,
    notes: ''
  });

  useEffect(() => {
    if (activeOutlet) {
      loadData();
    }
  }, [activeOutlet]);

  const loadData = async () => {
    if (!activeOutlet) return;
    setIsLoading(true);
    try {
      console.log("RECIPES_UI: FETCHING_DATA", { outletId: activeOutlet.id });
      // FIX START
      const [recipes, items, invData] = await Promise.all([
        recipeService.fetchRecipes(activeOutlet.id),
        menuService.fetchItems(),
        getSupabase().from('inventory').select('id, name').eq('outlet_id', activeOutlet.id)
      ]);
      setGroupedRecipes(recipes);
      setMenuItems(items || []);
      setInventoryItems(invData.data || []);
      // FIX END
      console.log("RECIPES_UI: DATA_LOADED", { recipes, itemsCount: items?.length });
    } catch (error) {
      console.error("RECIPES_UI: LOAD_ERROR", error);
      alert("Failed to load recipes. Check console.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateRecipe = async () => {
    if (!selectedTarget || !activeOutlet) return;
    setIsGeneratingAI(true);
    try {
      console.log("RECIPES_UI: TRIGGER_GENERATE", { itemName: selectedTarget.name });
      const newRecipe = await recipeService.generateRecipe(selectedTarget.name, activeOutlet.id, selectedTarget.id);
      console.log("RECIPES_UI: GENERATE_SUCCESS", newRecipe);
      
      await loadData();
      setIsAIRecipeOpen(false);
      setSelectedTarget(null);
    } catch (error: any) {
      console.error("RECIPES_UI: GENERATE_ERROR", error);
      alert(`Generation failed: ${error.message}`);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleSaveManualRecipe = async () => {
    if (!activeOutlet) return;
    try {
      console.log("RECIPES_UI: TRIGGER_MANUAL_SAVE", manualForm);
      await recipeService.createManualRecipe({
        menuitemid: manualForm.menuitemid,
        itemName: manualForm.itemname,
        outletId: activeOutlet.id, // Use activeOutlet.id directly to be safe
        ingredients: manualForm.ingredients,
        steps: manualForm.steps,
        yield: manualForm.yield,
        notes: manualForm.notes
      });
      await loadData();
      setIsManualRecipeOpen(false);
      setManualForm({
        menuitemid:'',
        itemname:'',
        outletid:activeOutlet.id,
        ingredients: [{ inventoryItemId: '', name: '', quantity: 0, unit: 'gram', cost: 0 }],
        steps: [''],
        yield: 1,
        notes: ''
      });
    } catch (error: any) {
      console.error("RECIPES_UI: MANUAL_SAVE_ERROR", error);
      alert(`Save failed: ${error.message}`);
    }
  };

  const handleQueueRecipe = async (recipeId: string) => {
    try {
      console.log("RECIPES_UI: TRIGGER_QUEUE", { recipeId });
       console.log("myoutlet", activeOutlet.id);
     
     
      await recipeService.queueRecipe(recipeId,activeOutlet.id);
      await loadData();
    } catch (error: any) {
      console.error("RECIPES_UI: QUEUE_ERROR", error);
      alert(`Failed to queue: ${error.message}`);
    }
  };

  const handleFinalizeRecipe = async (recipeId: string) => {
    try {
      console.log("RECIPES_UI: TRIGGER_FINALIZE", { recipeId });
      await recipeService.finalizeRecipe(recipeId,activeOutlet.id);
      await loadData();
    } catch (error: any) {
      console.error("RECIPES_UI: FINALIZE_ERROR", error);
      alert(`Failed to finalize: ${error.message}`);
    }
  };

  const handleRejectRecipe = async (recipeId: string) => {
    if (!activeOutlet) return;
    try {
      await recipeService.rejectRecipe(recipeId, activeOutlet.id);
      await loadData();
    } catch (error: any) {
      alert(`Failed to reject: ${error.message}`);
    }
  };

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [menuItems, searchQuery]);

  const renderRecipeCard = (recipe: RecipeEntry) => {
    const isFinalized = recipe.status === 'FINALIZED';
    const isQueued = recipe.status === 'QUEUED';
    const isDraft = recipe.status === 'DRAFT';
    const isAI = recipe.source === 'AI';

    return (
      <div key={recipe.id} className={`bg-white rounded-[32px] border shadow-sm p-6 space-y-4 transition-all hover:shadow-md ${isFinalized ? 'border-emerald-100 bg-emerald-50/5' : isQueued ? 'border-indigo-100 bg-indigo-50/5' : 'border-slate-100'}`}>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">{recipe.item_name}</h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {isDraft && (
                <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border flex items-center gap-1 ${isAI ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                  {isAI ? <><Sparkles size={10} /> AI Recipe</> : <><Edit3 size={10} /> Manual Recipe</>}
                </span>
              )}
              {isQueued && <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-indigo-100 flex items-center gap-1"><Clock size={10} /> Queued</span>}
              {isFinalized && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-1"><BadgeCheck size={10} /> Finalized</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Est. Cost</p>
            <p className="font-black text-slate-900">₹{recipe.recipe_json.total_cost.toFixed(0)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ingredients</p>
          <div className="grid grid-cols-2 gap-2">
            {recipe.recipe_json.ingredients.slice(0, 4).map((ing, i) => (
              <div key={i} className="text-[10px] font-bold text-slate-600 flex justify-between bg-slate-50 px-3 py-1.5 rounded-xl">
                <span>{ing.name}</span>
                <span className="text-slate-400">{ing.quantity} {ing.unit}</span>
              </div>
            ))}
            {recipe.recipe_json.ingredients.length > 4 && (
              <div className="text-[10px] font-bold text-slate-400 italic px-3 py-1.5">+ {recipe.recipe_json.ingredients.length - 4} more</div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-50 flex gap-2">
          {isDraft && (
            <>
              <button 
                onClick={() => handleQueueRecipe(recipe.id)}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
              >
                <CheckSquare size={14} /> Add to Queue
              </button>
              <button 
                onClick={() => handleRejectRecipe(recipe.id)}
                className="p-3 bg-slate-100 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
          {isQueued && (
            <>
              <button 
                onClick={() => handleFinalizeRecipe(recipe.id)}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
              >
                <BadgeCheck size={14} /> Finalize
              </button>
              <button 
                onClick={() => handleRejectRecipe(recipe.id)}
                className="p-3 bg-slate-100 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
          {isFinalized && (
            <div className="flex-1 py-3 bg-slate-50 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2">
              <Lock size={14} /> Recipe Locked
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isLoading && menuItems.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-4 py-20">
         <Loader2 className="animate-spin text-orange-500" size={48} />
         <p className="font-black text-slate-400 uppercase text-xs tracking-widest">Synchronizing Recipe Grid...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 min-h-screen pb-20 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">Recipe Engineering</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">AI-Assisted Production Planning</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setIsAIRecipeOpen(true)}
            className="bg-indigo-600 text-white px-8 py-4 rounded-[24px] font-black text-xs shadow-xl shadow-indigo-200 flex items-center gap-3 hover:scale-105 transition-all active:scale-95"
          >
            <Sparkles size={18} /> Generate with AI
          </button>
          <button 
            onClick={() => setIsManualRecipeOpen(true)}
            className="bg-white border-2 border-slate-900 text-slate-900 px-8 py-4 rounded-[24px] font-black text-xs shadow-xl flex items-center gap-3 hover:scale-105 transition-all active:scale-95"
          >
            <Edit3 size={18} /> Create Manually
          </button>
        </div>
      </div>

      <div className="space-y-12">
        {/* DRAFT SECTION */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><Sparkles size={18} /></div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Draft Recipes</h3>
            <span className="px-3 py-1 bg-slate-100 text-slate-400 rounded-full text-[10px] font-black">{groupedRecipes.DRAFT.length}</span>
          </div>
          {groupedRecipes.DRAFT.length === 0 ? (
            <div className="py-12 border-2 border-dashed border-slate-100 rounded-[40px] flex flex-col items-center justify-center text-slate-300 gap-4">
              <ChefHat size={48} className="opacity-20" />
              <p className="font-black uppercase text-[10px] tracking-widest">No drafts pending review</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedRecipes.DRAFT.map(renderRecipeCard)}
            </div>
          )}
        </section>

        {/* QUEUED SECTION */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><Clock size={18} /></div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Queued for Approval</h3>
            <span className="px-3 py-1 bg-slate-100 text-slate-400 rounded-full text-[10px] font-black">{groupedRecipes.QUEUED.length}</span>
          </div>
          {groupedRecipes.QUEUED.length === 0 ? (
            <div className="py-12 border-2 border-dashed border-slate-100 rounded-[40px] flex flex-col items-center justify-center text-slate-300 gap-4">
              <CheckSquare size={48} className="opacity-20" />
              <p className="font-black uppercase text-[10px] tracking-widest">Queue is empty</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedRecipes.QUEUED.map(renderRecipeCard)}
            </div>
          )}
        </section>

        {/* FINALIZED SECTION */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl"><BadgeCheck size={18} /></div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Finalized Recipes</h3>
            <span className="px-3 py-1 bg-slate-100 text-slate-400 rounded-full text-[10px] font-black">{groupedRecipes.FINALIZED.length}</span>
          </div>
          {groupedRecipes.FINALIZED.length === 0 ? (
            <div className="py-12 border-2 border-dashed border-slate-100 rounded-[40px] flex flex-col items-center justify-center text-slate-300 gap-4">
              <Lock size={48} className="opacity-20" />
              <p className="font-black uppercase text-[10px] tracking-widest">No finalized recipes yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedRecipes.FINALIZED.map(renderRecipeCard)}
            </div>
          )}
        </section>
      </div>

      {/* AI Generation Modal */}
      {isAIRecipeOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-[48px] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
              <div className="p-12 bg-indigo-600 text-white flex flex-col items-center gap-4 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-8 opacity-10"><Sparkles size={120} /></div>
                 <div className="w-20 h-20 bg-white/20 rounded-[32px] flex items-center justify-center backdrop-blur-xl border border-white/20"><Wand2 size={40} /></div>
                 <h3 className="text-3xl font-black tracking-tight uppercase">Recipe Architect</h3>
                 <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest text-center px-10 leading-relaxed">Gemini 3 Pro will predict ingredients, quantities, and steps based on dish profiles.</p>
              </div>

              <div className="p-12 space-y-8">
                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Target Dish</label>
                    <div className="relative">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text"
                        placeholder="Search menu items..."
                        className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-100 rounded-[24px] font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {filteredMenuItems.map(m => (
                        <button 
                          key={m.id}
                          onClick={() => setSelectedTarget(m)}
                          className={`w-full p-4 text-left rounded-2xl font-bold text-sm transition-all flex justify-between items-center ${selectedTarget?.id === m.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-100 text-slate-600 hover:border-indigo-200'}`}
                        >
                          {m.name}
                          {selectedTarget?.id === m.id && <CheckCircle size={16} />}
                        </button>
                      ))}
                    </div>
                 </div>

                 <div className="flex gap-4">
                    <button onClick={() => setIsAIRecipeOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-400 rounded-[24px] font-black uppercase tracking-widest text-sm">Cancel</button>
                    <button 
                      disabled={!selectedTarget || isGeneratingAI}
                      onClick={handleGenerateRecipe}
                      className="flex-[2] py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-2xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                    >
                       {isGeneratingAI ? <Loader2 className="animate-spin" size={20} /> : <><Sparkles size={18} /> Generate Recipe</>}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Manual Recipe Modal */}
      {isManualRecipeOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-[48px] w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300 max-h-[90vh]">
              <div className="p-8 border-b bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/10 rounded-2xl"><Edit3 size={24} /></div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight">Manual Recipe Creation</h3>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Engineer your dish manually</p>
                    </div>
                 </div>
                 <button onClick={() => setIsManualRecipeOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={24} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-10">
                 {/* Item Name Selection */}
                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Target Dish</label>
                    <div className="relative">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text"
                        placeholder="Search menu items..."
                        className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-100 rounded-[24px] font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {filteredMenuItems.map(m => (
                        <button 
                          key={m.id}
                          onClick={() => {
                            setSelectedTarget(m);
                            setManualForm({...manualForm, menuitemid: m.id});
                          }}
                          className={`w-full p-4 text-left rounded-2xl font-bold text-sm transition-all flex justify-between items-center ${selectedTarget?.id === m.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-100 text-slate-600 hover:border-indigo-200'}`}
                        >
                          {m.name}
                          {selectedTarget?.id === m.id && <CheckCircle size={16} />}
                        </button>
                      ))}
                    </div>
                 </div>


                 {/* Ingredients */}
                 <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ingredients</label>
                      <button 
                        onClick={() => setManualForm({
                          ...manualForm, 
                          ingredients: [...manualForm.ingredients, { inventoryItemId: '', name: '', quantity: 0, unit: 'gram', cost: 0 }]
                        })}
                        className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700"
                      >
                        <Plus size={14} /> Add Ingredient
                      </button>
                    </div>
                    <div className="space-y-3">
                      {manualForm.ingredients.map((ing, idx) => (
                        <div key={idx} className="flex gap-3 items-center animate-in slide-in-from-left-2">
                          {/* FIX START */}
                          <select 
                            className="flex-[2] px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-slate-900"
                            value={ing.inventoryItemId || ing.name}
                            onChange={async (e) => {
                              const selectedId = e.target.value;
                              const selectedItem = inventoryItems.find(i => i.id === selectedId);
                              if (!selectedItem) return;

                              const newIngs = [...manualForm.ingredients];
                              newIngs[idx].inventoryItemId = selectedId;
                              newIngs[idx].name = selectedItem.name;
                              
                              // FETCH DYNAMIC COST (WAC) - INV-C-03
                              if (activeOutlet) {
                                try {
                                  const wac = await inventoryService.getWeightedAverageCost(selectedId, activeOutlet.id);
                                  newIngs[idx].cost = wac;
                                } catch (err) {
                                  console.error("WAC Fetch Failed:", err);
                                }
                              }
                              
                              setManualForm({...manualForm, ingredients: newIngs});
                            }}
                          >
                            <option value="">Select Ingredient</option>
                            {inventoryItems.map(item => (
                              <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                          </select>
                          {/* FIX END */}
                          <input 
                            type="number"
                            placeholder="Qty"
                            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-slate-900"
                            value={ing.quantity || ''}
                            onChange={(e) => {
                              const newIngs = [...manualForm.ingredients];
                              newIngs[idx].quantity = parseFloat(e.target.value) || 0;
                              setManualForm({...manualForm, ingredients: newIngs});
                            }}
                          />
                          <select 
                            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-slate-900"
                            value={ing.unit}
                            onChange={(e) => {
                              const newIngs = [...manualForm.ingredients];
                              newIngs[idx].unit = e.target.value;
                              setManualForm({...manualForm, ingredients: newIngs});
                            }}
                          >
                            <option value="gram">Gram</option>
                            <option value="kg">KG</option>
                            <option value="ml">ML</option>
                            <option value="litre">Litre</option>
                            <option value="unit">Unit</option>
                          </select>
                          <input 
                            type="number"
                            placeholder="Cost"
                            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-slate-900"
                            value={ing.cost || ''}
                            onChange={(e) => {
                              const newIngs = [...manualForm.ingredients];
                              newIngs[idx].cost = parseFloat(e.target.value) || 0;
                              setManualForm({...manualForm, ingredients: newIngs});
                            }}
                          />
                          {manualForm.ingredients.length > 1 && (
                            <button 
                              onClick={() => setManualForm({
                                ...manualForm,
                                ingredients: manualForm.ingredients.filter((_, i) => i !== idx)
                              })}
                              className="p-2 text-slate-300 hover:text-rose-500"
                            >
                              <Minus size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                 </div>

                 {/* Steps */}
                 <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preparation Steps</label>
                      <button 
                        onClick={() => setManualForm({
                          ...manualForm, 
                          steps: [...manualForm.steps, '']
                        })}
                        className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700"
                      >
                        <Plus size={14} /> Add Step
                      </button>
                    </div>
                    <div className="space-y-3">
                      {manualForm.steps.map((step, idx) => (
                        <div key={idx} className="flex gap-3 items-start animate-in slide-in-from-left-2">
                          <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-black text-xs text-slate-400 shrink-0 mt-2">{idx + 1}</span>
                          <textarea 
                            placeholder="Describe step..."
                            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-slate-900 min-h-[80px]"
                            value={step}
                            onChange={(e) => {
                              const newSteps = [...manualForm.steps];
                              newSteps[idx] = e.target.value;
                              setManualForm({...manualForm, steps: newSteps});
                            }}
                          />
                          {manualForm.steps.length > 1 && (
                            <button 
                              onClick={() => setManualForm({
                                ...manualForm,
                                steps: manualForm.steps.filter((_, i) => i !== idx)
                              })}
                              className="p-2 text-slate-300 hover:text-rose-500 mt-2"
                            >
                              <Minus size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                 </div>

                 {/* Yield & Notes */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Yield / Portions</label>
                      <input 
                        type="number"
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-[20px] font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-900"
                        value={manualForm.yield}
                        onChange={(e) => setManualForm({...manualForm, yield: parseFloat(e.target.value) || 1})}
                      />
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Internal Notes</label>
                      <input 
                        type="text"
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-[20px] font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-900"
                        value={manualForm.notes}
                        onChange={(e) => setManualForm({...manualForm, notes: e.target.value})}
                      />
                    </div>
                 </div>
              </div>

              <div className="p-10 border-t bg-slate-50 flex justify-between items-center shrink-0">
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculated Cost</p>
                    <h4 className="text-2xl font-black text-slate-900">₹{manualForm.ingredients.reduce((s, i) => s + ((i.cost || 0) * (i.quantity || 0)), 0).toFixed(0)}</h4>
                 </div>
                 <div className="flex gap-4">
                    <button onClick={() => setIsManualRecipeOpen(false)} className="px-8 py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px]">Cancel</button>
                    <button 
                      onClick={handleSaveManualRecipe}
                      disabled={!manualForm.menuitemid || manualForm.ingredients.some(i => !i.name)}
                      className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl active:scale-95 transition-all disabled:opacity-30"
                    >
                      Save Draft
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Recipes;
