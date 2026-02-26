
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChefHat, Search, Trash2, X, 
  CheckCircle, ArrowRight, 
  PlusCircle, Loader2, Sparkles, Wand2, ShieldAlert, BadgeCheck, Save,
  Clock, Lock, CheckSquare
} from 'lucide-react';
import { menuService } from '../services/supabaseService';
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
  const [selectedTarget, setSelectedTarget] = useState<MenuItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
      const [recipes, items] = await Promise.all([
        recipeService.fetchRecipes(activeOutlet.id),
        menuService.fetchItems()
      ]);
      setGroupedRecipes(recipes);
      setMenuItems(items || []);
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
      const newRecipe = await recipeService.generateRecipe(selectedTarget.name, activeOutlet.id);
      console.log("RECIPES_UI: GENERATE_SUCCESS", newRecipe);
      
      // Refresh data to show the new draft
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

  const handleQueueRecipe = async (recipeId: string) => {
    try {
      console.log("RECIPES_UI: TRIGGER_QUEUE", { recipeId });
      await recipeService.queueRecipe(recipeId);
      await loadData();
    } catch (error: any) {
      console.error("RECIPES_UI: QUEUE_ERROR", error);
      alert(`Failed to queue: ${error.message}`);
    }
  };

  const handleFinalizeRecipe = async (recipeId: string) => {
    try {
      console.log("RECIPES_UI: TRIGGER_FINALIZE", { recipeId });
      await recipeService.finalizeRecipe(recipeId);
      await loadData();
    } catch (error: any) {
      console.error("RECIPES_UI: FINALIZE_ERROR", error);
      alert(`Failed to finalize: ${error.message}`);
    }
  };

  const handleRejectRecipe = async (recipeId: string) => {
    try {
      await recipeService.rejectRecipe(recipeId);
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

    return (
      <div key={recipe.id} className={`bg-white rounded-[32px] border shadow-sm p-6 space-y-4 transition-all hover:shadow-md ${isFinalized ? 'border-emerald-100 bg-emerald-50/5' : isQueued ? 'border-indigo-100 bg-indigo-50/5' : 'border-slate-100'}`}>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">{recipe.item_name}</h3>
            <div className="flex items-center gap-2 mt-1">
              {isDraft && <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-amber-100 flex items-center gap-1"><Sparkles size={10} /> AI Draft</span>}
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
        <button 
          onClick={() => setIsAIRecipeOpen(true)}
          className="bg-indigo-600 text-white px-10 py-5 rounded-[24px] font-black text-sm shadow-2xl shadow-indigo-200 flex items-center gap-3 hover:scale-105 transition-all active:scale-95"
        >
          <Sparkles size={20} /> Generate Recipe
        </button>
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
    </div>
  );
};

export default Recipes;
