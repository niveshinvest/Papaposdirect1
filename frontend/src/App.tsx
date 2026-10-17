import React, { useState, useEffect, FC, ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../src/components/Sidebar';
import BottomNav from '../src/components/BottomNav';
import Dashboard from '../src/components/Dashboard';
import POS from '../src/components/POS';
import KDS from '../src/components/KDS';
import Inventory from '../src/components/Inventory';
import Recipes from '../src/components/Recipes';
import Reports from '../src/components/Reports';
import PurchaseOrders from '../src/components/PurchaseOrders';
import Settings from '../src/components/Settings';
import AIInsights from '../src/components/AIInsights';
import AICopilotDock from '../src/components/AICopilotDock';
import {
  InventoryDashboard,
  ItemMaster,
  PurchaseEntry,
  SupplierManagement,
  BrandManagement,
  StockView,
  BatchInventory,
  StockTransfer,
  StockAdjustment,
  ExpiryTracking,
  LowStockAlerts,
  Reports as InventoryReports,
  BarcodeManager,
  BulkImport,
  WastageDamage,
  AIInsightsPanel,
  NLSearch
} from './inventory';
import LandingPage from '../src/components/LandingPage';
import Auth from '../src/components/Auth';
import Outlets from '../src/components/Outlets';
import MoreMenu from '../src/components/MoreMenu';
import Profile from '../src/components/Profile';
import MenuManagement from '../src/components/MenuManagement';
import WhatsAppIntegration from '../src/components/WhatsAppIntegration';
import GstReports from '../src/components/GstReports';
import UserManagement from '../src/components/UserManagement';
import StockTransfers from '../src/components/StockTransfers';
import DeliveryIntegrations from '../src/components/DeliveryIntegrations';
import SessionGuard from '../src/components/SessionGuard';
import TerminalManagement from '../src/components/TerminalManagement';
import StaffOnboarding from '../src/components/StaffOnboarding';
import { TenantSelection } from '../src/components/TenantSelection';
import { ViewMode, Organization, Outlet, Company } from './types';
import { authService, cloudOutlets, tenantContext, getSupabase, initSupabase } from '../src/services/supabaseService';
import { getDatabaseVersion, applyMigration, getMigrationFile } from '../src/services/migrationService';
import { syncService } from '../src/services/syncService';
import { sessionService } from '../src/services/sessionService';
import { db } from '../src/services/db';
import { Store, ChevronDown, Loader2, ShieldAlert, Building2, ChevronRight } from 'lucide-react';
import POSnew from '../src/pos/screens/PosScreen';

const MANAGEMENT_ROLES = ['OWNER', 'ADMIN'] as const;

const getAccessibleOutlets = (allOutlets: Outlet[], profile: any): Outlet[] => {
  if (!profile) return allOutlets || [];

  const role = String(profile.role || '').toUpperCase();
  if (role === 'OWNER') {
    return allOutlets || [];
  }

  const allowedOutletIds = new Set(
    (profile.outlets || [])
      .map((outlet: any) => outlet?.id)
      .filter((id: string | undefined): id is string => Boolean(id))
  );

  if (!allowedOutletIds.size) {
    return [];
  }

  return (allOutlets || []).filter((outlet) => allowedOutletIds.has(outlet.id));
};

const applyPendingMigrations = async (pendingVersions: number[]) => {
  console.log(`Boot Engine: Applying ${pendingVersions.length} pending migrations...`);
  for (const version of pendingVersions) {
    const fileName = getMigrationFile(version);
    if (!fileName) continue;

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

  // Small delay to allow schema cache to refresh
  await new Promise(resolve => setTimeout(resolve, 2000));
};

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
  const canSwitchCompany = MANAGEMENT_ROLES.includes((user?.role || '').toUpperCase() as any);
  const canSwitchOutlet = outlets.length > 1;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(view === ViewMode.POS);

  useEffect(() => {
    setIsSidebarCollapsed(view === ViewMode.POS);
  }, [view]);

  return (
    <div className="flex min-h-dvh w-full flex-col md:flex-row overflow-x-hidden">
      <Sidebar 
        currentView={view} 
        onViewChange={(v) => navigate(`/${v.toLowerCase()}`)} 
        org={org} 
        user={user} 
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />
      <div className="flex min-w-0 flex-1 flex-col bg-slate-50 transition-all duration-300">
        
        <header className="sticky top-0 z-[100] border-b bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6">
           <div className="flex flex-wrap items-center gap-3">
             
              {/* Company Switcher */}
              {canSwitchCompany && (
                <button 
                  onClick={onCompanySwitch}
                  className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2 text-white transition-all hover:bg-slate-800 group sm:w-auto sm:min-w-[150px]"
                >
                   <Building2 size={14} className="text-orange-500" />
                   <span className="flex-1 text-[11px] font-black uppercase tracking-tight text-left truncate">
                     {org?.name || 'Select Company'}
                   </span>
                   <ChevronDown size={14} className="text-slate-500 group-hover:text-white" />
                </button>
              )}

              <div className="relative flex w-full min-w-0 items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2 sm:w-auto sm:min-w-[200px]">
                 <Store size={14} className="text-orange-500" />
                 <select 
                   className={`flex-1 bg-transparent border-none text-[11px] font-black text-slate-800 outline-none appearance-none pr-8 z-10 ${canSwitchOutlet ? 'cursor-pointer' : 'cursor-default'}`}
                   value={activeOutlet?.id || ''}
                   disabled={!canSwitchOutlet}
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

        <main className="min-w-0 flex-1 overflow-x-hidden pb-20 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav 
        currentView={view} 
        onViewChange={(v) => navigate(`/${v.toLowerCase()}`)} 
      />
      <AICopilotDock
        currentView={view}
        user={user}
        org={org}
        activeOutlet={activeOutlet}
        onNavigate={(targetView) => navigate(`/${targetView.toLowerCase()}`)}
      />
    </div>
  );
};

const FeaturePending: FC<{ title: string }> = ({ title }) => (
  <div className="p-6">
    <div className="max-w-2xl rounded-3xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">{title}</h2>
      <p className="mt-2 text-sm font-medium text-slate-600">
        This module is currently behind a feature gate and will be enabled after data integration is completed.
      </p>
    </div>
  </div>
);

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

  const loadCloudConfiguration = async () => {
    console.log("Boot Engine: Loading cloud configuration...");
    const cloudConfig = await db.config.get('supabase');
    if (cloudConfig && cloudConfig.url && cloudConfig.key && cloudConfig.isEnabled) {
      console.log("Boot Engine: Initializing Supabase with custom config...");
      initSupabase(cloudConfig.url, cloudConfig.key);
    }
  };

  const runPendingMigrations = async () => {
    console.log("Boot Engine: Checking database version...");
    const status = await getDatabaseVersion();
    console.log("Boot Engine: Database status:", status);
    
    if ((status as any).error) {
      throw new Error((status as any).error);
    }
    
    if (status.needsUpdate) {
      await applyPendingMigrations(status.pendingVersions);
    }
  };

  const hydrateTenantSession = async (ctx: { company_id: string; outlet_id: string | null; role?: string | null }) => {
    console.log("Boot Engine: Fetching user profile...");
    const profile = await authService.getProfile();
    if (!profile) {
      console.warn("Boot Engine: Profile not found for user.");
      setSelectionRequired(true);
      return;
    }

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
    const accessibleOutlets = getAccessibleOutlets(cloudList || [], profile);
    setOutlets(accessibleOutlets || []);
    
    const active = accessibleOutlets.find(o => o.id === ctx.outlet_id) || accessibleOutlets[0] || null;
    if (active) {
      console.log("Boot Engine: Performing terminal handshake for outlet:", active.id);
      setActiveOutlet(active);
      tenantContext.set(profile.company_id, active.id, profile.role);
      await sessionService.performHandshake(active.id);
      console.log("Boot Engine: Starting sync engine...");
      syncService.start(profile);
    } else {
      setActiveOutlet(null);
      tenantContext.set(profile.company_id, null, profile.role);
    }

    setSelectionRequired(false);
  };

  const bootSequence = async () => {
    setLoading(true);
    console.log("Boot Engine: Initializing system sequence...");
    try {
      if (!navigator.onLine) {
        throw new Error("You are currently offline. Please check your internet connection.");
      }

      await loadCloudConfiguration();
      await runPendingMigrations();

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
        await hydrateTenantSession(ctx);
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
    authService.clearProfileCache();
    localStorage.removeItem('papapos_session');
    setAuthState({ user: null, org: null });
    setSelectionRequired(false);
    navigate('/');
  };

  const handleOutletChange = async (outlet: Outlet) => {
    const ctx = tenantContext.get();
    if (ctx) {
      tenantContext.set(ctx.company_id, outlet.id, authState.user?.role || ctx.role);
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

  // 🚀 Allow onboarding route without tenant/session
if (location.pathname.includes('/onboarding')) {
  return (
    <Routes>
      <Route path="/onboarding/:token" element={<StaffOnboarding />} />
    </Routes>
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
        <Route path="/pos-new" element={authState.user ? <Layout view={ViewMode.POS} {...commonProps}><POSnew org={authState.org} activeOutlet={activeOutlet} currentUser={authState.user} /></Layout> : <Navigate to="/auth" />} />

        
        <Route path="/inventory" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><Inventory activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/dashboard" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><InventoryDashboard /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/items" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><ItemMaster /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/purchase" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><PurchaseEntry /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/suppliers" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><SupplierManagement /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/brands" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><BrandManagement /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/stock" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><StockView /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/batches" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><BatchInventory /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/transfers" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><StockTransfer /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/adjustments" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><StockAdjustment /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/expiry" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><ExpiryTracking /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/alerts" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><LowStockAlerts /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/reports" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><InventoryReports /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/barcodes" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><BarcodeManager /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/import" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><BulkImport /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/wastage" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><WastageDamage /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/ai" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><AIInsightsPanel /></Layout> : <Navigate to="/auth" />} />
        <Route path="/inventory/assistant" element={authState.user ? <Layout view={ViewMode.INVENTORY} {...commonProps}><NLSearch /></Layout> : <Navigate to="/auth" />} />
        <Route path="/recipes" element={authState.user ? <Layout view={ViewMode.RECIPES} {...commonProps}><Recipes activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/menu_management" element={authState.user ? <Layout view={ViewMode.MENU_MANAGEMENT} {...commonProps}><MenuManagement activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/outlets" element={authState.user ? <Layout view={ViewMode.OUTLETS} {...commonProps}><Outlets /></Layout> : <Navigate to="/auth" />} />
        <Route path="/user_management" element={authState.user ? <Layout view={ViewMode.USER_MANAGEMENT} {...commonProps}><UserManagement /></Layout> : <Navigate to="/auth" />} />
        <Route path="/terminal_management" element={authState.user ? <Layout view={ViewMode.TERMINAL_MANAGEMENT} {...commonProps}><TerminalManagement /></Layout> : <Navigate to="/auth" />} />
        <Route path="/settings" element={authState.user ? <Layout view={ViewMode.SETTINGS} {...commonProps}><Settings org={authState.org} onUpdateOrg={() => {}} activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/ai_insights" element={authState.user ? <Layout view={ViewMode.AI_INSIGHTS} {...commonProps}><AIInsights activeOutletId={activeOutlet?.id} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/reports" element={authState.user ? <Layout view={ViewMode.REPORTS} {...commonProps}><Reports activeOutletId={activeOutlet?.id} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/kitchen_display" element={authState.user ? <Layout view={ViewMode.KITCHEN_DISPLAY} {...commonProps}><KDS activeOutletId={activeOutlet?.id} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/crm" element={authState.user ? <Layout view={ViewMode.CRM} {...commonProps}><FeaturePending title="CRM" /></Layout> : <Navigate to="/auth" />} />
        <Route path="/whatsapp" element={authState.user ? <Layout view={ViewMode.WHATSAPP} {...commonProps}><WhatsAppIntegration /></Layout> : <Navigate to="/auth" />} />
        <Route path="/gst_reports" element={authState.user ? <Layout view={ViewMode.GST_REPORTS} {...commonProps}><GstReports activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/transfers" element={authState.user ? <Layout view={ViewMode.TRANSFERS} {...commonProps}><StockTransfers activeOutlet={activeOutlet} org={authState.org} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/purchase_orders" element={authState.user ? <Layout view={ViewMode.PURCHASE_ORDERS} {...commonProps}><PurchaseOrders activeOutlet={activeOutlet} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/delivery_partners" element={authState.user ? <Layout view={ViewMode.DELIVERY_PARTNERS} {...commonProps}><DeliveryIntegrations /></Layout> : <Navigate to="/auth" />} />
        <Route path="/profile" element={authState.user ? <Layout view={ViewMode.PROFILE} {...commonProps}><Profile user={authState.user} org={authState.org} onSignOut={handleSignOut} /></Layout> : <Navigate to="/auth" />} />
        <Route path="/recycle_bin" element={authState.user ? <Layout view={ViewMode.RECYCLE_BIN} {...commonProps}><FeaturePending title="Recycle Bin" /></Layout> : <Navigate to="/auth" />} />
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
