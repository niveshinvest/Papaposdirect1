import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import Dashboard from './components/Dashboard';
import POS from './components/POS';
import KDS from './components/KDS';
import AIInsights from './components/AIInsights';
import Inventory from './components/Inventory';
import Recipes from './components/Recipes';
import Reports from './components/Reports';
import PurchaseOrders from './components/PurchaseOrders';
import Settings from './components/Settings';
import CRM from './components/CRM';
import LandingPage from './components/LandingPage';
import Auth from './components/Auth';
import Outlets from './components/Outlets';
import MoreMenu from './components/MoreMenu';
import Profile from './components/Profile';
import MenuManagement from './components/MenuManagement';
import RecycleBin from './components/RecycleBin';
import WhatsAppIntegration from './components/WhatsAppIntegration';
import GstReports from './components/GstReports';
import UserManagement from './components/UserManagement';
import StockTransfers from './components/StockTransfers';
import DeliveryIntegrations from './components/DeliveryIntegrations';
import SessionGuard from './components/SessionGuard';
import TerminalManagement from './components/TerminalManagement';
import StaffOnboarding from './components/StaffOnboarding';
import { ViewMode, Organization, User, Outlet } from './types';
import { authService, cloudOutlets } from './services/supabaseService';
import { syncService } from './services/syncService';
import { sessionService } from './services/sessionService';
import { Store, ChevronDown, Loader2, ShieldAlert } from 'lucide-react';

const App: React.FC = () => {
  const [activeOutlet, setActiveOutlet] = useState<Outlet | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [authState, setAuthState] = useState<{ user: any | null; org: Organization | null }>({ user: null, org: null });
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const bootSequence = async () => {
      try {
        const profile = await authService.getProfile();
        if (profile) {
          setAuthState({ user: profile, org: profile.companies });
          
          if (location.pathname === '/' || location.pathname === '/auth') {
            if (['CASHIER', 'KITCHEN_STAFF'].includes(profile.role)) {
              navigate('/pos');
            } else {
              navigate('/dashboard');
            }
          }

          const cloudList = await cloudOutlets.fetchAll();
          setOutlets(cloudList || []);
          
          if (cloudList && cloudList.length > 0) {
            const initialOutlet = cloudList[0];
            setActiveOutlet(initialOutlet);
            
            await sessionService.performHandshake(initialOutlet.id);
            syncService.start(profile);
          }
        }
      } catch (e: any) {
        console.error("POS Boot Failure:", e);
        setBootError(e.message || "System boot failure. Check cloud connection.");
      } finally {
        setLoading(false);
      }
    };
    
    bootSequence();
    return () => syncService.stop();
  }, []);

  const handleOutletChange = async (outlet: Outlet) => {
    setActiveOutlet(outlet);
    setLoading(true);
    try {
      await sessionService.performHandshake(outlet.id);
      if (authState.user) syncService.start(authState.user);
    } catch (e) {
      console.error("Outlet change handshake failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const wrap = (component: React.ReactNode, view: ViewMode) => (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar 
        currentView={view} 
        onViewChange={(v) => navigate(`/${v.toLowerCase()}`)} 
        org={authState.org} 
        user={authState.user} 
      />
      <div className="flex-1 md:ml-64 bg-slate-50 min-h-screen flex flex-col">
        <header className="h-16 border-b bg-white/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-[100]">
           <div className="flex items-center gap-4">
              <h1 className="font-black text-slate-800 uppercase tracking-tighter text-sm hidden lg:block">{view.replace(/_/g, ' ')}</h1>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100 relative min-w-[200px]">
                 <Store size={14} className="text-orange-50" />
                 <select 
                   className="flex-1 bg-transparent border-none text-[11px] font-black text-slate-800 outline-none appearance-none cursor-pointer pr-8 z-10"
                   value={activeOutlet?.id || ''}
                   onChange={(e) => {
                     const selected = outlets?.find(o => o.id === e.target.value);
                     if (selected) handleOutletChange(selected);
                   }}
                 >
                    {(outlets?.length === 0 || !outlets) && <option value="">No Outlets Registered</option>}
                    {outlets?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                 </select>
                 <ChevronDown size={14} className="text-slate-400 absolute right-4 pointer-events-none" />
              </div>
           </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">
          {component}
        </main>
      </div>
      <BottomNav 
        currentView={view} 
        onViewChange={(v) => navigate(`/${v.toLowerCase()}`)} 
      />
    </div>
  );

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6">
         {bootError ? (
           <div className="text-center space-y-4 animate-in zoom-in duration-300">
             <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                <ShieldAlert size={32} />
             </div>
             <div className="space-y-2">
               <h2 className="text-xl font-black uppercase tracking-tighter">Boot Failure</h2>
               <p className="text-slate-400 text-xs font-bold max-w-xs mx-auto leading-relaxed">{bootError}</p>
             </div>
             <button 
               onClick={() => window.location.reload()}
               className="px-8 py-3 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl active:scale-95 transition-all"
             >
               Retry Connection
             </button>
           </div>
         ) : (
           <>
             <Loader2 className="animate-spin text-orange-500 mb-4" size={48} />
             <p className="font-black uppercase tracking-widest text-[10px]">Verifying Identity Grid...</p>
           </>
         )}
      </div>
    );
  }

  return (
    <SessionGuard>
      <Routes>
        <Route path="/" element={<LandingPage onLogin={() => navigate('/auth')} onGetStarted={() => navigate('/signup')} />} />
        <Route path="/auth" element={<Auth type="login" onCancel={() => navigate('/')} onAuthenticated={async (org, user) => { 
          setAuthState({ org, user }); 
          navigate('/dashboard'); 
        }} />} />
        <Route path="/signup" element={<Auth type="signup" onCancel={() => navigate('/')} onAuthenticated={async (org, user) => { 
          setAuthState({ org, user }); 
          navigate('/dashboard'); 
        }} />} />
        
        <Route path="/onboarding/:token" element={<StaffOnboarding />} />

        <Route path="/dashboard" element={authState.user ? wrap(<Dashboard activeOutletId={activeOutlet?.id} />, ViewMode.DASHBOARD) : <Navigate to="/auth" />} />
        <Route path="/pos" element={authState.user ? wrap(<POS org={authState.org} activeOutlet={activeOutlet} currentUser={authState.user} />, ViewMode.POS) : <Navigate to="/auth" />} />
        <Route path="/inventory" element={authState.user ? wrap(<Inventory activeOutlet={activeOutlet} />, ViewMode.INVENTORY) : <Navigate to="/auth" />} />
        <Route path="/recipes" element={authState.user ? wrap(<Recipes inventoryItems={[]} menuItems={[]} recipes={[]} onSaveRecipe={async () => {}} onDeleteRecipe={async () => {}} onBulkDeleteRecipes={async () => {}} />, ViewMode.RECIPES) : <Navigate to="/auth" />} />
        <Route path="/menu_management" element={authState.user ? wrap(<MenuManagement activeOutlet={activeOutlet} />, ViewMode.MENU_MANAGEMENT) : <Navigate to="/auth" />} />
        <Route path="/outlets" element={authState.user ? wrap(<Outlets />, ViewMode.OUTLETS) : <Navigate to="/auth" />} />
        <Route path="/user_management" element={authState.user ? wrap(<UserManagement />, ViewMode.USER_MANAGEMENT) : <Navigate to="/auth" />} />
        <Route path="/terminal_management" element={authState.user ? wrap(<TerminalManagement />, ViewMode.TERMINAL_MANAGEMENT) : <Navigate to="/auth" />} />
        <Route path="/settings" element={authState.user ? wrap(<Settings org={authState.org} onUpdateOrg={() => {}} activeOutlet={activeOutlet} />, ViewMode.SETTINGS) : <Navigate to="/auth" />} />
        <Route path="/ai_insights" element={authState.user ? wrap(<AIInsights salesData={[]} menuItems={[]} activeOutletId={activeOutlet?.id} />, ViewMode.AI_INSIGHTS) : <Navigate to="/auth" />} />
        {/* Fix: Corrected component props for Reports */}
        <Route path="/reports" element={authState.user ? wrap(<Reports activeOutletId={activeOutlet?.id} />, ViewMode.REPORTS) : <Navigate to="/auth" />} />
        <Route path="/kitchen_display" element={authState.user ? wrap(<KDS activeOutletId={activeOutlet?.id} />, ViewMode.KITCHEN_DISPLAY) : <Navigate to="/auth" />} />
        <Route path="/crm" element={authState.user ? wrap(<CRM customers={[]} onSaveCustomer={async () => {}} onDeleteCustomer={async () => {}} />, ViewMode.CRM) : <Navigate to="/auth" />} />
        <Route path="/whatsapp" element={authState.user ? wrap(<WhatsAppIntegration />, ViewMode.WHATSAPP) : <Navigate to="/auth" />} />
        <Route path="/gst_reports" element={authState.user ? wrap(<GstReports activeOutlet={activeOutlet} />, ViewMode.GST_REPORTS) : <Navigate to="/auth" />} />
        <Route path="/transfers" element={authState.user ? wrap(<StockTransfers activeOutlet={activeOutlet} org={authState.org} />, ViewMode.TRANSFERS) : <Navigate to="/auth" />} />
        <Route path="/purchase_orders" element={authState.user ? wrap(<PurchaseOrders activeOutlet={activeOutlet} />, ViewMode.PURCHASE_ORDERS) : <Navigate to="/auth" />} />
        <Route path="/delivery_partners" element={authState.user ? wrap(<DeliveryIntegrations />, ViewMode.DELIVERY_PARTNERS) : <Navigate to="/auth" />} />
        <Route path="/profile" element={authState.user ? wrap(<Profile user={authState.user} org={authState.org} onSignOut={() => { setAuthState({user: null, org: null}); navigate('/'); }} />, ViewMode.PROFILE) : <Navigate to="/auth" />} />
        <Route path="/recycle_bin" element={authState.user ? wrap(<RecycleBin items={[]} onRestore={async () => {}} onPermanentDelete={async () => {}} />, ViewMode.RECYCLE_BIN) : <Navigate to="/auth" />} />
        <Route path="/mobile_menu" element={authState.user ? wrap(<MoreMenu user={authState.user} org={authState.org} onSignOut={() => navigate('/')} onViewChange={(v) => navigate(`/${v.toLowerCase()}`)} currentView={ViewMode.MOBILE_MENU} />, ViewMode.MOBILE_MENU) : <Navigate to="/auth" />} />

        <Route path="*" element={<Navigate to={authState.user ? "/dashboard" : "/"} />} />
      </Routes>
    </SessionGuard>
  );
};

export default App;