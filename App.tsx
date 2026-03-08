import React, { useState, useEffect, FC, ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
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
import { TenantSelection } from './components/TenantSelection';
import { ViewMode, Organization, User, Outlet, Company } from './types';
import { authService, cloudOutlets, companyService, outletService, tenantContext, getSupabase } from './services/supabaseService';
import { getDatabaseVersion, applyMigration, getMigrationFile } from './services/migrationService';
import { syncService } from './services/syncService';
import { sessionService } from './services/sessionService';
import { Store, ChevronDown, Loader2, ShieldAlert, Building2, LogOut } from 'lucide-react';

const Layout: FC<{ 
  children: ReactNode; 
  view: ViewMode; 
  org: Organization | null; 
  user: any; 
  activeOutlet: Outlet | null; 
  outlets: Outlet[]; 
  onOutletChange: (o: Outlet) => void;
  onCompanySwitch: () => void;
}> = ({ children, view, org, user, activeOutlet, outlets, onOutletChange, onCompanySwitch }) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar 
        currentView={view} 
        onViewChange={(v) => navigate(`/${v.toLowerCase()}`)} 
        org={org} 
        user={user} 
      />
      <div className="flex-1 md:ml-64 bg-slate-50 min-h-screen flex flex-col">
        <header className="h-16 border-b bg-white/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-[100]">
           <div className="flex items-center gap-4">
              <h1 className="font-black text-slate-800 uppercase tracking-tighter text-sm hidden lg:block">{view.replace(/_/g, ' ')}</h1>
              
              {/* Company Switcher */}
              <button 
                onClick={onCompanySwitch}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-2xl border border-slate-800 relative min-w-[150px] hover:bg-slate-800 transition-all group"
              >
                 <Building2 size={14} className="text-orange-500" />
                 <span className="flex-1 text-[11px] font-black uppercase tracking-tight text-left truncate">
                   {org?.name || 'Select Company'}
                 </span>
                 <ChevronDown size={14} className="text-slate-500 group-hover:text-white" />
              </button>

              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100 relative min-w-[200px]">
                 <Store size={14} className="text-orange-50" />
                 <select 
                   className="flex-1 bg-transparent border-none text-[11px] font-black text-slate-800 outline-none appearance-none cursor-pointer pr-8 z-10"
                   value={activeOutlet?.id || ''}
                   onChange={(e) => {
                     const selected = outlets?.find(o => o.id === e.target.value);
                     if (selected) onOutletChange(selected);
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
          {children}
        </main>
      </div>
      <BottomNav 
        currentView={view} 
        onViewChange={(v) => navigate(`/${v.toLowerCase()}`)} 
      />
    </div>
  );
};

const AppContent: FC = () => {
  const [activeOutlet, setActiveOutlet] = useState<Outlet | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [authState, setAuthState] = useState<{ user: any | null; org: Organization | null }>({ user: null, org: null });
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  
  // Multi-tenant state
  const [selectionRequired, setSelectionRequired] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const bootSequence = async () => {
    setLoading(true);
    try {
      // Auto-run pending migrations
      const status = await getDatabaseVersion();
      if (status.needsUpdate) {
        console.log("Database update required. Applying pending migrations...");
        for (const version of status.pendingVersions) {
          const fileName = getMigrationFile(version);
          if (fileName) {
            const response = await fetch(`/${fileName}`);
            const sql = await response.text();
            await applyMigration(version, sql);
          }
        }
        // Small delay to allow schema cache to refresh
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const user = await authService.getCurrentUser();
      if (!user) {
        setSelectionRequired(false);
        setLoading(false);
        return;
      }

      const ctx = tenantContext.get();
      if (ctx && ctx.company_id && ctx.outlet_id) {
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
          
          const active = cloudList.find(o => o.id === ctx.outlet_id) || cloudList[0];
          if (active) {
            setActiveOutlet(active);
            await sessionService.performHandshake(active.id);
            syncService.start(profile);
          }
          setSelectionRequired(false);
        } else {
          setSelectionRequired(true);
        }
      } else {
        setSelectionRequired(true);
      }
    } catch (e: any) {
      console.error("POS Boot Failure:", e);
      setBootError(e.message || "System boot failure. Check cloud connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootSequence();
    return () => syncService.stop();
  }, []);

  const handleTenantComplete = async (company: Company, outlet: Outlet, role: string) => {
    tenantContext.set(company.id, outlet.id, role);
    await bootSequence();
  };

  const handleSignOut = async () => {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    localStorage.removeItem('papapos_session');
    setAuthState({ user: null, org: null });
    setSelectionRequired(false);
    navigate('/');
  };

  const handleOutletChange = async (outlet: Outlet) => {
    const ctx = tenantContext.get();
    if (ctx) {
      tenantContext.set(ctx.company_id, outlet.id, ctx.role);
    }
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

  if (selectionRequired) {
    return <TenantSelection onComplete={handleTenantComplete} onSignOut={handleSignOut} />;
  }

  const commonProps = {
    org: authState.org,
    user: authState.user,
    activeOutlet,
    outlets,
    onOutletChange: handleOutletChange,
    onCompanySwitch: () => setSelectionRequired(true)
  };

  return (
    <SessionGuard>
      <Routes>
        <Route path="/" element={<LandingPage onLogin={() => navigate('/auth')} onGetStarted={() => navigate('/signup')} />} />
        <Route path="/auth" element={<Auth type="login" onCancel={() => navigate('/')} onAuthenticated={bootSequence} />} />
        <Route path="/signup" element={<Auth type="signup" onCancel={() => navigate('/')} onAuthenticated={bootSequence} />} />
        
        <Route path="/onboarding/:token" element={<StaffOnboarding />} />

        <Route path="/dashboard" element={authState.user ? <Layout view={ViewMode.DASHBOARD} {...commonProps}><Dashboard activeOutletId={activeOutlet?.id} profile={authState.user} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/pos" element={authState.user ? <Layout view={ViewMode.POS} {...commonProps}><POS org={authState.org} activeOutlet={activeOutlet} currentUser={authState.user} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><Inventory activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/recipes" element={authState.user ? <Layout view={ViewMode.RECIPES} {...commonProps}><Recipes activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/menu_management" element={authState.user ? <Layout view={ViewMode.MENU_MANAGEMENT} {...commonProps}><MenuManagement activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/outlets" element={authState.user ? <Layout view={ViewMode.OUTLETS} {...commonProps}><Outlets /></Layout> : <Navigate to="/auth" />} />
        <Route path="/user_management" element={authState.user ? <Layout view={ViewMode.USER_MANAGEMENT} {...commonProps}><UserManagement /></Layout> : <Navigate to="/auth" />} />
        <Route path="/terminal_management" element={authState.user ? <Layout view={ViewMode.TERMINAL_MANAGEMENT} {...commonProps}><TerminalManagement /></Layout> : <Navigate to="/auth" />} />
        <Route path="/settings" element={authState.user ? <Layout view={ViewMode.SETTINGS} {...commonProps}><Settings org={authState.org} onUpdateOrg={() => {}} activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/ai_insights" element={authState.user ? <Layout view={ViewMode.AI_INSIGHTS} {...commonProps}><AIInsights salesData={[]} menuItems={[]} activeOutletId={activeOutlet?.id} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/reports" element={authState.user ? <Layout view={ViewMode.REPORTS} {...commonProps}><Reports activeOutletId={activeOutlet?.id} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/kitchen_display" element={authState.user ? <Layout view={ViewMode.KITCHEN_DISPLAY} {...commonProps}><KDS activeOutletId={activeOutlet?.id} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/crm" element={authState.user ? <Layout view={ViewMode.CRM} {...commonProps}><CRM customers={[]} onSaveCustomer={async () => {}} onDeleteCustomer={async () => {}} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/whatsapp" element={authState.user ? <Layout view={ViewMode.WHATSAPP} {...commonProps}><WhatsAppIntegration /></Layout> : <Navigate to="/auth" />} />
        <Route path="/gst_reports" element={authState.user ? <Layout view={ViewMode.GST_REPORTS} {...commonProps}><GstReports activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/transfers" element={authState.user ? <Layout view={ViewMode.TRANSFERS} {...commonProps}><StockTransfers activeOutlet={activeOutlet} org={authState.org} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/purchase_orders" element={authState.user ? <Layout view={ViewMode.PURCHASE_ORDERS} {...commonProps}><PurchaseOrders activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/delivery_partners" element={authState.user ? <Layout view={ViewMode.DELIVERY_PARTNERS} {...commonProps}><DeliveryIntegrations /></Layout> : <Navigate to="/auth" />} />
        <Route path="/profile" element={authState.user ? <Layout view={ViewMode.PROFILE} {...commonProps}><Profile user={authState.user} org={authState.org} onSignOut={handleSignOut} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/recycle_bin" element={authState.user ? <Layout view={ViewMode.RECYCLE_BIN} {...commonProps}><RecycleBin items={[]} onRestore={async () => {}} onPermanentDelete={async () => {}} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/mobile_menu" element={authState.user ? <Layout view={ViewMode.MOBILE_MENU} {...commonProps}><MoreMenu user={authState.user} org={authState.org} onSignOut={handleSignOut} onViewChange={(v) => navigate(`/${v.toLowerCase()}`)} currentView={ViewMode.MOBILE_MENU} /></Layout> : <Navigate to="/auth" />} />

        <Route path="*" element={<Navigate to={authState.user ? "/dashboard" : "/"} />} />
      </Routes>
    </SessionGuard>
  );
};

const App: FC = () => {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
};

export default App;