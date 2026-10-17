
import React from 'react';
import { NAVIGATION_ITEMS } from '../constants';
import { ViewMode, User, Organization } from '../types';
import { LogOut, ChevronRight, User as UserIcon, Settings, Trash2, RefreshCcw } from 'lucide-react';

interface MoreMenuProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  user: any | null;
  org: Organization | null;
  onSignOut: () => void;
  onClearCache?: () => Promise<void>;
}

const MoreMenu: React.FC<MoreMenuProps> = ({ onViewChange, user, org, onSignOut, onClearCache }) => {
  const handleClearCache = async () => {
    const confirmed = window.confirm("Clear Local Database & Re-Sync? This will wipe your local data and automatically enable cloud synchronization. Any unsynced local changes will be lost.");
    if (confirmed && onClearCache) {
      await onClearCache();
      alert("Cache cleared successfully. The system is now re-syncing from Supabase.");
    }
  };

  const displayName = user?.full_name || user?.name || 'Staff';

  return (
    <div className="p-6 space-y-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900 rounded-[40px] p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <UserIcon size={120} />
        </div>
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-[24px] bg-orange-500 flex items-center justify-center font-black text-2xl border-4 border-white/10 shadow-lg">
              {displayName.charAt(0)}
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tight">{displayName}</h3>
              <p className="text-[10px] font-black uppercase text-orange-500 tracking-widest">{user?.role}</p>
            </div>
          </div>
          
          <button 
            onClick={() => onViewChange(ViewMode.PROFILE)}
            className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-[10px] transition-all border border-white/5"
          >
            <Settings size={14} /> Manage Account
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {NAVIGATION_ITEMS.map((item) => {
          // Check role and plan
          const isRoleAllowed = user && item.allowedRoles.includes(user.role);
          if (!isRoleAllowed) return null;

          // Don't show primary dashboard/pos/inventory in the "More" grid to avoid redundancy
          if (['DASHBOARD', 'POS', 'INVENTORY'].includes(item.id)) return null;

          const plans = ['BASIC', 'PRO', 'ENTERPRISE'];
          const orgPlanIndex = plans.indexOf(org?.plan || 'BASIC');
          const minPlanIndex = plans.indexOf(item.minPlan);
          const isLocked = orgPlanIndex < minPlanIndex;

          return (
            <button
              key={item.id}
              disabled={isLocked}
              onClick={() => onViewChange(item.id as ViewMode)}
              className={`flex flex-col items-center justify-center gap-3 p-6 rounded-[32px] border transition-all active:scale-95 ${
                isLocked 
                ? 'bg-gray-50 border-gray-100 opacity-40' 
                : 'bg-white border-gray-100 shadow-sm hover:border-orange-200'
              }`}
            >
              <div className={`p-3 rounded-2xl ${isLocked ? 'bg-gray-200 text-gray-400' : 'bg-orange-50 text-orange-600'}`}>
                {item.icon}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-800 text-center leading-tight">
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => onViewChange(ViewMode.RECYCLE_BIN)}
          className="flex flex-col items-center justify-center gap-3 p-6 rounded-[32px] border bg-white border-gray-100 shadow-sm hover:border-red-200 transition-all active:scale-95 group"
        >
          <div className="p-3 rounded-2xl bg-red-50 text-red-500 group-hover:bg-red-500 group-hover:text-white transition-all">
            <Trash2 size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-800 text-center leading-tight">
            Recycle Bin
          </span>
        </button>

        <button
          onClick={handleClearCache}
          className="flex flex-col items-center justify-center gap-3 p-6 rounded-[32px] border bg-orange-50 border-orange-100 shadow-sm hover:border-orange-200 transition-all active:scale-95 group"
        >
          <div className="p-3 rounded-2xl bg-orange-500 text-white transition-all">
            <RefreshCcw size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-orange-700 text-center leading-tight">
            Clear Cache & Sync
          </span>
        </button>
      </div>

      <div className="space-y-3">
        <button 
          onClick={onSignOut}
          className="w-full flex items-center justify-between p-6 bg-red-50 text-red-600 rounded-[32px] font-black uppercase tracking-widest text-xs"
        >
          <div className="flex items-center gap-3">
            <LogOut size={20} /> Sign Out
          </div>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default MoreMenu;
