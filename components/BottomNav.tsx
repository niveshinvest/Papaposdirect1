
import React from 'react';
import { ViewMode } from '../types';
import { LayoutDashboard, Receipt, Package, Menu as MenuIcon } from 'lucide-react';

interface BottomNavProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onViewChange }) => {
  const navItems = [
    { id: ViewMode.DASHBOARD, label: 'Home', icon: <LayoutDashboard size={20} /> },
    { id: ViewMode.POS, label: 'Billing', icon: <Receipt size={20} /> },
    { id: ViewMode.INVENTORY, label: 'Stock', icon: <Package size={20} /> },
    { id: ViewMode.MOBILE_MENU, label: 'More', icon: <MenuIcon size={20} /> },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex items-center justify-between z-[100] pb-safe">
      {navItems.map((item) => {
        const isActive = currentView === item.id;
        
        return (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id as ViewMode)}
            className={`flex flex-col items-center gap-1 transition-all ${isActive ? 'text-orange-500' : 'text-gray-400'}`}
          >
            <div className={`p-1 rounded-lg ${isActive ? 'bg-orange-50' : ''}`}>
              {item.icon}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
