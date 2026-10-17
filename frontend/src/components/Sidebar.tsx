
import { NAVIGATION_ITEMS, COLORS } from '../constants';
import { ViewMode, Organization, User } from '../types';
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, Tag, FileText, Users, Award, Package, Database, Repeat, Edit3, Calendar, AlertTriangle, FileSpreadsheet, Barcode, Loader2, Zap, ShieldCheck, Trash2, RefreshCcw, ChevronLeft, ChevronRight } from 'lucide-react';

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  org: Organization | null;
  user: any | null; // Changed to any to support both User type and Profile record from DB
  onClearCache?: () => Promise<void>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, org, user, onClearCache, collapsed = false, onToggleCollapse }) => {
  const handleClearCache = async () => {
    const confirmed = window.confirm("Clear Local Database & Re-Sync? This will wipe your local data and automatically enable cloud synchronization. Any unsynced local changes will be lost.");
    if (confirmed && onClearCache) {
      await onClearCache();
      alert("Cache cleared successfully. The system is now re-syncing from Supabase.");
    }
  };

  const displayName = user?.full_name || user?.name || 'Staff';
  const displayRole = user?.role || 'User';
  const [inventoryExpanded, setInventoryExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // collapse submenu when navigating away
    if (currentView !== ViewMode.INVENTORY) setInventoryExpanded(false);
  }, [currentView]);

  const isActiveSubpath = (path: string) => {
    try {
      return location.pathname.startsWith(path);
    } catch (e) { return false; }
  };

  const handleInventoryClick = (view: ViewMode) => {
    if (!inventoryExpanded) {
      onViewChange(view);
    }
    setInventoryExpanded(prev => !prev);
  };

  return (
    <div className={`hidden md:flex ${collapsed ? 'w-20' : 'w-64'} shrink-0 bg-[#1e293b] text-white flex-col h-dvh sticky top-0 z-50 transition-all duration-300 overflow-y-auto overflow-x-hidden scrollbar-hide` }>
      <div className={`p-6 ${collapsed ? 'px-3' : 'px-8'} flex items-center ${collapsed ? 'justify-center' : 'gap-3'} border-b border-slate-800 relative`}>
        {onToggleCollapse && (
          <button onClick={onToggleCollapse} className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-10 rounded-r-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center">
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        )}
        <div className="w-10 h-10 bg-[#FF6B00] rounded-xl flex items-center justify-center font-black text-xl shadow-lg">
          P
        </div>
        <div className={collapsed ? 'hidden' : ''}>
          <h1 className="font-black text-lg tracking-tighter leading-none">PapaPos</h1>
          <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest opacity-80">Pro SaaS</span>
        </div>
      </div>


    
      <nav className={`flex-1 mt-6 ${collapsed ? 'px-2' : 'px-4'} space-y-1 overflow-y-auto overflow-x-hidden scrollbar-hide`}>
        {NAVIGATION_ITEMS.map((item) => {
          const isRoleAllowed = user && item.allowedRoles.includes(user.role);
          if (!isRoleAllowed) return null;

          const plans = ['BASIC', 'PRO', 'ENTERPRISE'];
          const orgPlanIndex = plans.indexOf(org?.plan || 'BASIC');
          const minPlanIndex = plans.indexOf(item.minPlan);
          const isLocked = orgPlanIndex < minPlanIndex;

          // Special handling for Inventory to toggle submenu
          if (item.id === 'INVENTORY') {
            return (
              <div key={item.id}>
                <button
                  disabled={isLocked}
                  onClick={() => handleInventoryClick(item.id as ViewMode)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInventoryExpanded(prev => !prev); } }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${
                    currentView === item.id 
                      ? 'bg-[#FF6B00] text-white shadow-xl shadow-orange-900/20' 
                      : isLocked ? 'opacity-30 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  aria-expanded={inventoryExpanded}
                >
                  <div className={`flex items-center ${collapsed ? 'justify-center w-full' : 'gap-3'}`}>
                    {item.icon}
                    {!collapsed && <span className="font-bold text-sm tracking-tight">{item.label}</span>}
                  </div>
                  {isLocked && !collapsed && (
                    <div className="bg-slate-700 p-1 rounded-md">
                       <Zap size={10} className="text-orange-500" />
                    </div>
                  )}
                </button>
              </div>
            );
          }

          return (
            <button
              key={item.id}
              disabled={isLocked}
              onClick={() => onViewChange(item.id as ViewMode)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${
                currentView === item.id 
                  ? 'bg-[#FF6B00] text-white shadow-xl shadow-orange-900/20' 
                  : isLocked ? 'opacity-30 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className={`flex items-center ${collapsed ? 'justify-center w-full' : 'gap-3'}`}>
                {item.icon}
                {!collapsed && <span className="font-bold text-sm tracking-tight">{item.label}</span>}
              </div>
            </button>
          );
        })}

        <div className="pt-4 mt-4 border-t border-slate-800 space-y-1">
          <button
            onClick={() => onViewChange(ViewMode.RECYCLE_BIN)}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-xl transition-all ${
              currentView === ViewMode.RECYCLE_BIN 
                ? 'bg-red-600 text-white shadow-xl shadow-red-900/20' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Trash2 size={20} />
            {!collapsed && <span className="font-bold text-sm tracking-tight">Recycle Bin</span>}
          </button>

          <button
            onClick={handleClearCache}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-xl transition-all text-orange-500 hover:bg-orange-500 hover:text-white font-black`}
          >
            <RefreshCcw size={20} />
            {!collapsed && <span className="text-sm tracking-tight uppercase tracking-widest text-[10px]">Clear Cache & Sync</span>}
          </button>
        </div>
      </nav>

        {!collapsed && inventoryExpanded && (
          <div className="px-4 mt-3" role="menu" aria-label="Inventory submenu">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Inventory</div>
            <div className="grid gap-2">
              {[
                { path: '/inventory/dashboard', label: 'Dashboard', icon: <BarChart3 size={14} /> },
                { path: '/inventory/items', label: 'Items', icon: <Tag size={14} /> },
                { path: '/inventory/purchase', label: 'Purchase Entry', icon: <FileText size={14} /> },
                { path: '/inventory/suppliers', label: 'Suppliers', icon: <Users size={14} /> },
                { path: '/inventory/brands', label: 'Brands', icon: <Award size={14} /> },
                { path: '/inventory/stock', label: 'Stock View', icon: <Package size={14} /> },
                { path: '/inventory/batches', label: 'Batches', icon: <Database size={14} /> },
                { path: '/inventory/transfers', label: 'Transfers', icon: <Repeat size={14} /> },
                { path: '/inventory/adjustments', label: 'Adjustments', icon: <Edit3 size={14} /> },
                { path: '/inventory/expiry', label: 'Expiry', icon: <Calendar size={14} /> },
                { path: '/inventory/alerts', label: 'Alerts', icon: <AlertTriangle size={14} /> },
                { path: '/inventory/reports', label: 'Reports', icon: <FileSpreadsheet size={14} /> },
                { path: '/inventory/barcodes', label: 'Barcodes', icon: <Barcode size={14} /> },
                { path: '/inventory/import', label: 'Bulk Import', icon: <Loader2 size={14} /> },
                { path: '/inventory/wastage', label: 'Wastage', icon: <AlertTriangle size={14} /> },
                { path: '/inventory/ai', label: 'AI Insights', icon: <BarChart3 size={14} /> },
                { path: '/inventory/assistant', label: 'Assistant', icon: <BarChart3 size={14} /> }
              ].map((it) => (
                <button
                  key={it.path}
                  role="menuitem"
                  tabIndex={0}
                  onClick={() => { navigate(it.path); setInventoryExpanded(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(it.path); setInventoryExpanded(false); } }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 text-left ${isActiveSubpath(it.path) ? 'bg-slate-800 text-white' : ''}`}
                >
                  <div className="w-4 h-4 text-slate-400">{it.icon}</div>
                  <span className="text-xs font-medium">{it.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

      <div className={`p-6 ${collapsed ? 'px-2' : ''} border-t border-slate-800`}>
        <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center font-black text-orange-500 uppercase">
              {displayName.charAt(0)}
            </div>
            <div className={`overflow-hidden text-left ${collapsed ? 'hidden' : ''}`}>
              <p className="text-sm font-black truncate leading-tight">{displayName}</p>
              <p className="text-[9px] font-black uppercase text-slate-500 tracking-tighter mt-0.5">{displayRole}</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 mt-2 ${collapsed ? 'justify-center' : ''}`}>
              <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                org?.plan === 'ENTERPRISE' ? 'bg-purple-500 text-white' : 
                org?.plan === 'PRO' ? 'bg-orange-500 text-white' : 
                'bg-slate-700 text-slate-400'
              }`}>
                {org?.plan} Plan
              </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
