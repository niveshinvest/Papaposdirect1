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
import { authService, cloudOutlets, companyService, outletService, tenantContext, getSupabase, initSupabase } from './services/supabaseService';
import { getDatabaseVersion, applyMigration, getMigrationFile } from './services/migrationService';
import { syncService } from './services/syncService';
import { sessionService } from './services/sessionService';
import { db } from './services/db';
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
  const [showCloudConfig, setShowCloudConfig] = useState(false);
  const [cloudForm, setCloudForm] = useState({ url: '', key: '' });
  
  // Multi-tenant state
  const [selectionRequired, setSelectionRequired] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const bootSequence = async () => {
    setLoading(true);
    console.log("Boot Engine: Initializing system sequence...");
    try {
      if (!navigator.onLine) {
        throw new Error("You are currently offline. Please check your internet connection.");
      }
      // 0. Load Cloud Config from Local DB
      console.log("Boot Engine: Loading cloud configuration...");
      const cloudConfig = await db.config.get('supabase');
      if (cloudConfig && cloudConfig.url && cloudConfig.key && cloudConfig.isEnabled) {
        console.log("Boot Engine: Initializing Supabase with custom config...");
        initSupabase(cloudConfig.url, cloudConfig.key);
      }

      // 1. Auto-run pending migrations
      console.log("Boot Engine: Checking database version...");
      const status = await getDatabaseVersion();
      console.log("Boot Engine: Database status:", status);
      
      if ((status as any).error) {
        throw new Error((status as any).error);
      }
      
      if (status.needsUpdate) {
        console.log(`Boot Engine: Applying ${status.pendingVersions.length} pending migrations...`);
        for (const version of status.pendingVersions) {
          const fileName = getMigrationFile(version);
          if (fileName) {
            try {
              console.log(`Boot Engine: Fetching migration ${version}: ${fileName}...`);
              const response = await fetch(`${window.location.origin}/${fileName}?v=${Date.now()}`);
              if (!response.ok) {
                throw new Error(`HTTP ${response.status} for ${fileName}`);
              }
              const sql = await response.text();
              if (!sql || sql.trim().length === 0) {
                throw new Error(`Empty migration file: ${fileName}`);
              }
              console.log(`Boot Engine: Applying migration ${version}...`);
              const result = await applyMigration(version, sql);
              if (!result.success) {
                throw new Error(`Migration ${version} failed: ${result.message}`);
              }
            } catch (fetchError: any) {
              console.error(`Boot Engine: Migration ${version} failure:`, fetchError);
              throw new Error(`Migration Pipeline Failure (${version}): ${fetchError.message}`);
            }
          }
        }
        // Small delay to allow schema cache to refresh
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log("Boot Engine: Verifying user identity...");
      const user = await authService.getCurrentUser();
      if (!user) {
        console.log("Boot Engine: No active user session found.");
        setSelectionRequired(false);
        setLoading(false);
        return;
      }

      console.log("Boot Engine: Resolving tenant context...");
      const ctx = tenantContext.get();
      if (ctx && ctx.company_id && ctx.outlet_id) {
        console.log("Boot Engine: Fetching user profile...");
        const profile = await authService.getProfile();
        if (profile) {
          console.log("Boot Engine: Profile resolved. Role:", profile.role);
          setAuthState({ user: profile, org: profile.companies });
          
          if (location.pathname === '/' || location.pathname === '/auth') {
            if (['CASHIER', 'KITCHEN_STAFF'].includes(profile.role)) {
              navigate('/pos');
            } else {
              navigate('/dashboard');
            }
          }

          console.log("Boot Engine: Fetching outlet list...");
          const cloudList = await cloudOutlets.fetchAll();
          setOutlets(cloudList || []);
          
          const active = cloudList.find(o => o.id === ctx.outlet_id) || cloudList[0];
          if (active) {
            console.log("Boot Engine: Performing terminal handshake for outlet:", active.id);
            setActiveOutlet(active);
            await sessionService.performHandshake(active.id);
            console.log("Boot Engine: Starting sync engine...");
            syncService.start(profile);
          }
          setSelectionRequired(false);
        } else {
          console.warn("Boot Engine: Profile not found for user.");
          setSelectionRequired(true);
        }
      } else {
        console.log("Boot Engine: Tenant selection required.");
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
    
    // Safety: Ensure profile has company_id set in DB for legacy/RLS consistency
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ company_id: company.id }).eq('id', user.id);
    }

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

  const handleSaveCloud = async () => {
    if (!cloudForm.url || !cloudForm.key) return;
    setLoading(true);
    try {
      await db.config.put({
        id: 'supabase',
        url: cloudForm.url,
        key: cloudForm.key,
        isEnabled: true,
        lastSyncedAt: null
      });
      initSupabase(cloudForm.url, cloudForm.key);
      setShowCloudConfig(false);
      setBootError(null);
      await bootSequence();
    } catch (e: any) {
      setBootError("Failed to save config: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6">
         {bootError ? (
           <div className="text-center space-y-6 animate-in zoom-in duration-300 max-w-sm">
             <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                <ShieldAlert size={32} />
             </div>
             <div className="space-y-2">
               <h2 className="text-xl font-black uppercase tracking-tighter">Boot Failure</h2>
               <p className="text-slate-400 text-xs font-bold leading-relaxed">{bootError}</p>
             </div>

             {showCloudConfig ? (
               <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 space-y-4 text-left">
                 <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Supabase URL</label>
                   <input 
                     type="text" 
                     className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-orange-500 transition-colors"
                     placeholder="https://your-project.supabase.co"
                     value={cloudForm.url}
                     onChange={e => setCloudForm({...cloudForm, url: e.target.value})}
                   />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Anon Key</label>
                   <input 
                     type="password" 
                     className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-orange-500 transition-colors"
                     placeholder="your-anon-key"
                     value={cloudForm.key}
                     onChange={e => setCloudForm({...cloudForm, key: e.target.value})}
                   />
                 </div>
                 <div className="flex gap-2 pt-2">
                   <button 
                     onClick={() => setShowCloudConfig(false)}
                     className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-black uppercase tracking-widest text-[10px]"
                   >
                     Cancel
                   </button>
                   <button 
                     onClick={handleSaveCloud}
                     className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px]"
                   >
                     Save & Retry
                   </button>
                 </div>
               </div>
             ) : (
               <div className="flex flex-col gap-3">
                 <button 
                   onClick={() => window.location.reload()}
                   className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl active:scale-95 transition-all"
                 >
                   Retry Connection
                 </button>
                 <button 
                   onClick={() => setShowCloudConfig(true)}
                   className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] border border-slate-700 active:scale-95 transition-all"
                 >
                   Configure Cloud
                 </button>
               </div>
             )}
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
        <Route path="/auth/reset-password" element={<Auth type="reset-password" onCancel={() => navigate('/auth')} onAuthenticated={bootSequence} />} />
        
        <Route path="/onboarding/:token" element={<StaffOnboarding />} />
        <Route path="/staff/onboarding" element={<StaffOnboarding />} />

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