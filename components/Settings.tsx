
import React, { useState, useEffect } from 'react';
import { 
  Store, CreditCard, Smartphone, Globe, 
  Save, Camera, Trash2, Plus, Banknote, CreditCard as CardIcon, 
  Smartphone as UpiIcon, Check, Zap, Database, RefreshCw, 
  HardDrive, Shield, Cloud, Link, AlertTriangle, CheckCircle2, Loader2, FileCode, Server,
  Printer as PrinterIcon, Network, Bluetooth, Usb, Edit2, X, Search, Cpu, Activity, Clock, ArrowUpCircle, Layers, MoveRight, LogOut, ShieldCheck, Wifi, Cable,
  ChevronRight, Bell, Mail, MessageSquare, BrainCircuit, ShieldAlert, Wallet, ListFilter
} from 'lucide-react';
import { Organization, PrinterConfig, Outlet, NotificationPrefs, PaymentMode, PaymentModeType, AIProvider } from '../types';
import { db } from '../services/db';
import { printerService, Printer, DiscoveredDevice } from '../services/printerService';
import { useLiveQuery } from 'dexie-react-hooks';
import { initSupabase, testConnection, getSupabase, authService, paymentService } from '../services/supabaseService';
import { getDatabaseVersion, applyMigration, getMigrationFile, MigrationStatus } from '../services/migrationService';
import { aiService } from '../services/aiService';

type SettingsTab = 'profile' | 'hardware' | 'payments' | 'alerts' | 'ai' | 'cloud' | 'database';

interface SettingsProps {
  org: Organization | null;
  onUpdateOrg: (updates: Partial<Organization>) => void;
  onClearCache?: () => Promise<void>;
  activeOutlet?: Outlet | null;
}

const Settings: React.FC<SettingsProps> = ({ org, onUpdateOrg, onClearCache, activeOutlet }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [registryPrinters, setRegistryPrinters] = useState<Printer[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRegistryModalOpen, setIsRegistryModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  
  // Cloud Sync States
  const syncConfig = useLiveQuery(() => db.config.get('supabase'));
  const [cloudForm, setCloudForm] = useState({ url: '', key: '', isEnabled: true });
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  // AI States
  const [isKillSwitchOn, setIsKillSwitchOn] = useState(org?.ai_kill_switch || false);
  const [aiProviders, setAiProviders] = useState<AIProvider[]>([]);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiForm, setAiForm] = useState<Partial<AIProvider>>({
    provider_name: 'gemini',
    model: '',
    api_key: '',
    base_url: '',
    is_active: false,
    is_default: false
  });

  // Migration States
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [applyingMigration, setApplyingMigration] = useState<number | null>(null);

  // Notification Preference State
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    whatsapp_enabled: true,
    email_enabled: true,
    quiet_hours_start: '23:00',
    quiet_hours_end: '07:00',
    min_severity: 'MEDIUM'
  });

  // Discovery-driven Printer Form
  const [registryForm, setRegistryForm] = useState<Partial<Printer>>({
    name: '',
    printer_type: 'LAN',
    connection_hint: '',
    is_default: false,
    is_active: true,
    outlet_id: activeOutlet?.id || ''
  });

  // Payment Mode Form
  const [mopForm, setMopForm] = useState<Partial<PaymentMode>>({
    name: '',
    type: 'CASH',
    is_default: false,
    is_active: true
  });

  useEffect(() => {
    if (activeOutlet && activeTab === 'hardware') {
      loadPrinters();
    }
    if (activeOutlet && activeTab === 'payments') {
      loadPaymentModes();
    }
    if (activeTab === 'cloud' && syncConfig) {
      setCloudForm({ url: syncConfig.url, key: syncConfig.key, isEnabled: syncConfig.isEnabled });
    }
    if (activeTab === 'database') {
      loadMigrationStatus();
    }
    if (activeTab === 'alerts' && org) {
      setNotifPrefs(org.notification_prefs || notifPrefs);
    }
    if (activeTab === 'ai' && org) {
      setIsKillSwitchOn(org.ai_kill_switch || false);
      loadAIProviders();
    }
  }, [activeOutlet, activeTab, syncConfig, org]);

  const loadPaymentModes = async () => {
    if (!activeOutlet) return;
    setLoading(true);
    try {
      const { data, error } = await getSupabase()
        .from('payment_modes')
        .select('*')
        .eq('outlet_id', activeOutlet.id);
        //.order('priority_order');
      if (!error) setPaymentModes(data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePaymentMode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOutlet || !org) return;
    setLoading(true);
    try {
      const client = getSupabase();
      
      // If setting as default, unset others first in this outlet
      if (mopForm.is_default) {
        const { data: modes } = await client
          .from('payment_modes')
          .select('id')
          .eq('outlet_id', activeOutlet.id)
          .eq('company_id', org.id);

        
        if (modes && modes.length > 0) {
          await client
            .from('payment_modes')
            .upsert(modes.map(m => ({ id: m.id, is_default: false })));
        }
      }

      const { error } = await client.from('payment_modes').upsert({
        ...mopForm,
        company_id: org.id,
        outlet_id: activeOutlet.id,
        priority_order: paymentModes.length
      });

      if (error) throw error;
      await loadPaymentModes();
      setIsPaymentModalOpen(false);
      setMopForm({ name: '', type: 'CASH', is_default: false, is_active: true });
    } catch (err: any) {
      alert(`Payment configuration failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadAIProviders = async () => {
    if (!org) return;
    setLoading(true);
    try {
      const { data, error } = await getSupabase()
        .from('ai_providers')
        .select('*')
        .eq('company_id', org.id)
        .order('created_at');
      if (!error) setAiProviders(data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAIProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setLoading(true);
    try {
      const client = getSupabase();
      const payload: any = {
        company_id: org.id,
        provider_name: aiForm.provider_name,
        model: aiForm.model,
        api_key: aiForm.api_key,
        base_url: aiForm.base_url,
        is_active: aiForm.is_active,
        is_default: aiForm.is_default,
        updated_at: new Date().toISOString()
      };

      if (aiForm.id) payload.id = aiForm.id;

      const { error } = await client
        .from('ai_providers')
        .upsert(payload);

      if (error) throw error;
      await loadAIProviders();
      setIsAIModalOpen(false);
      setAiForm({ provider_name: 'gemini', model: '', api_key: '', base_url: '', is_active: false, is_default: false });
    } catch (err: any) {
      alert(`AI configuration failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAIProvider = async (provider: AIProvider) => {
    if (!org) return;
    setLoading(true);
    try {
      const client = getSupabase();
      
      // The trigger handles ensuring only one is active, 
      // but we'll be explicit for UI responsiveness
      const { error } = await client
        .from('ai_providers')
        .upsert({ 
          id: provider.id,
          is_active: !provider.is_active,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      await loadAIProviders();
    } catch (err: any) {
      alert(`Toggle failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleKillSwitch = async () => {
    if (!org) return;
    if (!confirm(`Warning: Activating the Global AI Kill-Switch will immediately halt all insights, forecasts, and strategic alerts. Continue?`)) return;
    
    setLoading(true);
    try {
      const newStatus = !isKillSwitchOn;
      await aiService.toggleKillSwitch(org.id, newStatus);
      setIsKillSwitchOn(newStatus);
      onUpdateOrg({ ai_kill_switch: newStatus });
    } catch (e) {
      alert("Permission denied. Owner role required.");
    } finally {
      setLoading(false);
    }
  };

  const loadPrinters = async () => {
    if (!activeOutlet) return;
    setLoading(true);
    try {
      const data = await printerService.fetchPrinters(activeOutlet.id);
      setRegistryPrinters(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMigrationStatus = async () => {
    setLoading(true);
    try {
      const status = await getDatabaseVersion();
      setMigrationStatus(status);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const startHardwarePairing = async () => {
    if (registryForm.printer_type === 'LAN') {
      setIsScanning(true);
      setDiscoveredDevices([]);
      const results = await printerService.discoverDevices('wifi');
      setDiscoveredDevices(results);
      setIsScanning(false);
    } else {
      const results = await printerService.discoverDevices(
        registryForm.printer_type === 'BLUETOOTH' ? 'bluetooth' : 'usb'
      );
      
      if (results.length > 0) {
        handleSelectDevice(results[0]);
      } else {
        alert("Selection cancelled or device not found.");
      }
    }
  };

  const handleSelectDevice = (device: DiscoveredDevice) => {
    setRegistryForm({
      ...registryForm,
      name: device.name,
      connection_hint: device.technical_id
    });
    setDiscoveredDevices([]);
  };

  const handleSavePrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOutlet) return;
    if (!registryForm.connection_hint) return alert("Search and select a hardware device first.");
    
    setLoading(true);
    try {
      await printerService.addPrinter({ ...registryForm, outlet_id: activeOutlet.id });
      await loadPrinters();
      setIsRegistryModalOpen(false);
      setRegistryForm({
        name: '',
        printer_type: 'LAN',
        connection_hint: '',
        is_default: false,
        is_active: true,
        outlet_id: activeOutlet.id
      });
    } catch (e: any) {
      alert(`Failed to save printer: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (printerId: string) => {
    if (!activeOutlet) return;
    setLoading(true);
    try {
      await printerService.setDefaultPrinter(printerId, activeOutlet.id);
      await loadPrinters();
    } catch (e: any) {
      alert(`Failed to set default: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deletePrinter = async (id: string) => {
    if (!confirm("Remove this hardware from outlet registry?")) return;
    try {
      await printerService.deletePrinter(id);
      await loadPrinters();
    } catch (e) {
      alert("Delete failed.");
    }
  };

  const handleSaveCloud = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await db.config.put({
        id: 'supabase',
        url: cloudForm.url,
        key: cloudForm.key,
        isEnabled: cloudForm.isEnabled,
        lastSyncedAt: syncConfig?.lastSyncedAt || null
      });
      initSupabase(cloudForm.url, cloudForm.key);
      alert("Cloud configuration saved.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAlerts = async () => {
    if (!org) return;
    setLoading(true);
    try {
      const client = getSupabase();
      const { error } = await client
        .from('companies')
        .upsert({ 
          id: org.id, 
          notification_prefs: notifPrefs,
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
      alert("Alert preferences updated.");
    } catch (e) {
      alert("Failed to update preferences.");
    } finally {
      setLoading(false);
    }
  };

  const handleTestCloud = async () => {
    setTestStatus('testing');
    try {
      const result = await testConnection(cloudForm.url, cloudForm.key);
      if (result.success) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestError(result.message || 'Unknown error');
      }
    } catch (e: any) {
      setTestStatus('error');
      setTestError(e.message);
    }
  };

  const handleApplyMigration = async (version: number) => {
    setApplyingMigration(version);
    try {
      const fileName = getMigrationFile(version);
      if (!fileName) throw new Error("Migration file not found in registry.");
      
      const response = await fetch(`/${fileName}`);
      const sql = await response.text();
      
      const result = await applyMigration(version, sql);
      if (result.success) {
        await loadMigrationStatus();
      } else {
        alert(`Migration failed: ${result.message}`);
      }
    } catch (e: any) {
      alert(`System error: ${e.message}`);
    } finally {
      setApplyingMigration(null);
    }
  };

  const renderProfile = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-10">
        <div className="flex flex-col md:flex-row items-center gap-10">
          <div className="relative group">
            <div className="w-32 h-32 rounded-[40px] bg-slate-100 flex items-center justify-center border-4 border-white shadow-xl overflow-hidden">
               {org?.logo ? <img src={org.logo} className="w-full h-full object-cover" /> : <Store size={48} className="text-slate-300" />}
            </div>
            <button className="absolute -bottom-2 -right-2 p-3 bg-indigo-600 text-white rounded-2xl shadow-xl hover:scale-110 transition-all">
              <Camera size={18} />
            </button>
          </div>
          <div className="flex-1 space-y-4">
             <div className="space-y-1 text-center md:text-left">
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">{org?.name}</h3>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Brand Administration Dashboard</p>
             </div>
             <div className="flex flex-wrap justify-center md:justify-start gap-3">
                <span className="px-4 py-1.5 bg-orange-50 text-orange-600 rounded-xl text-[10px] font-black uppercase border border-orange-100 tracking-widest">{org?.plan} PLAN</span>
                <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase border border-indigo-100 tracking-widest">PRO SUBSCRIPTION ACTIVE</span>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t border-slate-50">
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Brand Legal Name</label>
              <input 
                className="w-full p-5 bg-slate-50 border-none rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                defaultValue={org?.name || ''} 
              />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account Owner</label>
              <input 
                className="w-full p-5 bg-slate-50 border-none rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                defaultValue={org?.ownerName || ''} 
              />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Corporate Email</label>
              <input 
                className="w-full p-5 bg-slate-50 border-none rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                defaultValue={org?.email || ''} 
              />
           </div>
           <div className="flex items-end">
              <button className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all">
                Save Profile Changes
              </button>
           </div>
        </div>
      </div>
    </div>
  );

  const renderAIControl = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
       <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
               <div className={`p-5 rounded-[28px] shadow-sm ${isKillSwitchOn ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                  <BrainCircuit size={32} />
               </div>
               <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">AI Control Plane</h3>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">System-wide Governance & Fail-safes</p>
               </div>
            </div>
            <button 
              onClick={() => {
                setAiForm({ provider_name: 'gemini', model: '', api_key: '', base_url: '', is_active: false, is_default: false });
                setIsAIModalOpen(true);
              }}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg"
            >
              <Plus size={18} /> Add Provider
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
             <div className="space-y-8">
                <div className={`p-8 rounded-[32px] border-2 transition-all ${isKillSwitchOn ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                   <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                         <ShieldAlert className={isKillSwitchOn ? 'text-rose-600' : 'text-slate-400'} size={24} />
                         <div>
                            <p className="font-black text-slate-800 text-sm">Global AI Kill-Switch</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Owner-only authority</p>
                         </div>
                      </div>
                      <button 
                        onClick={handleToggleKillSwitch}
                        disabled={loading}
                        className={`w-16 h-8 rounded-full transition-all relative ${isKillSwitchOn ? 'bg-rose-600' : 'bg-slate-300'}`}
                      >
                         <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${isKillSwitchOn ? 'right-1' : 'left-1'}`}></div>
                      </button>
                   </div>
                   <p className="text-xs font-medium text-slate-600 leading-relaxed italic">
                     When ON, all AI processing (Insights, Forecasts, Recommendations) will be completely bypassed. This is an immutable safety override.
                   </p>
                </div>
             </div>

             <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configured Providers</h4>
                {aiProviders.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed rounded-3xl text-slate-300">
                    <p className="text-xs font-bold uppercase">No providers configured</p>
                  </div>
                ) : (
                  aiProviders.map(provider => (
                    <div key={provider.id} className={`p-6 rounded-3xl border-2 transition-all ${provider.is_active ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'}`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-2xl ${provider.is_active ? 'bg-white' : 'bg-slate-50'}`}>
                            <Cpu size={20} className={provider.is_active ? 'text-emerald-600' : 'text-slate-400'} />
                          </div>
                          <div>
                            <p className="font-black text-slate-800 text-sm capitalize">{provider.provider_name}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{provider.model || 'Default Model'}</p>
                            {provider.is_default && <span className="text-[8px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-black uppercase ml-2">Default</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => {
                              setAiForm(provider);
                              setIsAIModalOpen(true);
                            }}
                            className="p-2 text-slate-400 hover:text-indigo-600"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleToggleAIProvider(provider)}
                            className={`w-12 h-6 rounded-full transition-all relative ${provider.is_active ? 'bg-emerald-600' : 'bg-slate-300'}`}
                          >
                            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${provider.is_active ? 'right-0.5' : 'left-0.5'}`}></div>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
             </div>
          </div>
       </div>
    </div>
  );

  const renderPayments = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
       <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-10">
          <div className="flex justify-between items-center">
             <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Payment Modes</h3>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Settlement channel orchestration</p>
             </div>
             <button 
               onClick={() => setIsPaymentModalOpen(true)}
               className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg"
             >
               <Plus size={18} /> New Mode
             </button>
          </div>

          <div className="space-y-4">
             {!activeOutlet ? (
               <div className="py-20 text-center text-slate-300 border-2 border-dashed rounded-[32px]">
                  <p className="font-black uppercase text-xs">Select outlet to manage payments</p>
               </div>
             ) : paymentModes.length === 0 ? (
               <div className="py-20 text-center text-slate-300 border-2 border-dashed rounded-[32px]">
                  <CreditCard size={48} className="opacity-20 mx-auto mb-4" />
                  <p className="font-black uppercase text-xs">No payment modes configured</p>
               </div>
             ) : (
               paymentModes.map(mop => (
                 <div key={mop.id} className={`flex items-center justify-between p-6 rounded-3xl border-2 transition-all ${mop.is_default ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100'}`}>
                    <div className="flex items-center gap-4">
                       <div className={`p-3 rounded-2xl ${mop.is_active ? 'bg-white shadow-sm' : 'bg-gray-100 text-gray-400'}`}>
                          {mop.type === 'CASH' ? <Banknote size={20} className="text-green-600" /> : 
                           mop.type === 'CARD' ? <CardIcon size={20} className="text-blue-600" /> : 
                           mop.type === 'DIGITAL' ? <Wallet size={20} className="text-purple-600" /> : <Layers size={20} />}
                       </div>
                       <div>
                          <p className="font-black text-slate-800 text-sm">{mop.name}</p>
                          <div className="flex items-center gap-2">
                             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{mop.type} Channel</span>
                             {mop.is_default && <span className="text-[8px] font-black text-indigo-600 uppercase bg-indigo-100 px-1.5 rounded">Default Mode</span>}
                          </div>
                       </div>
                    </div>
                    <div className="flex gap-2">
                       <button className="p-2 text-slate-300 hover:text-indigo-600"><Edit2 size={16} /></button>
                       {!mop.is_default && <button className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>}
                    </div>
                 </div>
               ))
             )}
          </div>
       </div>
    </div>
  );

   const renderHardware = () => (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
         <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-10">
            <div className="flex justify-between items-center">
               <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Printer Registry</h3>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Cloud-synchronized peripheral management</p>
               </div>
               <button 
                 onClick={() => setIsRegistryModalOpen(true)}
                 className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg"
               >
                 <Plus size={18} /> Register Hardware
               </button>
            </div>

            <div className="space-y-4">
               {registryPrinters.length === 0 ? (
                 <div className="py-20 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[32px]">
                    <PrinterIcon size={48} className="opacity-20 mb-4" />
                    <p className="font-black uppercase text-xs">No hardware registered</p>
                 </div>
               ) : (
                 registryPrinters.map(p => (
                   <div key={p.id} className={`flex items-center justify-between p-6 rounded-3xl border transition-all ${p.is_default ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-4">
                         <div className="p-3 bg-white rounded-2xl shadow-sm">
                            {p.printer_type === 'LAN' ? <Network size={20} className="text-indigo-500" /> : 
                             p.printer_type === 'BLUETOOTH' ? <Bluetooth size={20} className="text-blue-500" /> :
                             p.printer_type === 'USB' ? <Usb size={20} className="text-slate-500" /> :
                             <Cpu size={20} className="text-slate-400" />}
                         </div>
                         <div>
                            <p className="font-black text-slate-800 text-sm">{p.name}</p>
                            <div className="flex items-center gap-2">
                               <span className="text-[9px] font-bold text-slate-400 uppercase">{p.printer_type} • {p.connection_hint}</span>
                               {p.is_default && <span className="text-[8px] font-black text-indigo-600 uppercase bg-indigo-100 px-1.5 rounded">Default</span>}
                            </div>
                         </div>
                      </div>
                      <div className="flex gap-2">
                         {!p.is_default && (
                           <button 
                             onClick={() => handleSetDefault(p.id!)}
                             className="p-2 text-slate-300 hover:text-indigo-600 transition-all"
                             title="Set as Default"
                           >
                              <Zap size={18} />
                           </button>
                         )}
                         <button onClick={() => deletePrinter(p.id!)} className="p-2 text-slate-300 hover:text-rose-500 transition-all">
                            <Trash2 size={18} />
                         </button>
                      </div>
                   </div>
                 ))
               )}
            </div>
         </div>
      </div>
   );

  return (
    <div className="p-8 space-y-10 pb-32 max-w-7xl mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter leading-none">System Settings</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2">Enterprise Resource Configuration</p>
        </div>
      </div>

      <div className="flex gap-4 p-1 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto scrollbar-hide">
         {(['profile', 'hardware', 'payments', 'alerts', 'ai', 'cloud', 'database'] as SettingsTab[]).map(tab => (
           <button 
             key={tab}
             onClick={() => setActiveTab(tab)}
             className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
           >
             {tab}
           </button>
         ))}
      </div>

      <div className="mt-8">
        {activeTab === 'profile' && renderProfile()}
        {activeTab === 'hardware' && renderHardware()}
        {activeTab === 'payments' && renderPayments()}
        {activeTab === 'ai' && renderAIControl()}
        {['alerts', 'cloud', 'database'].includes(activeTab) && (
           <div className="bg-white p-20 rounded-[48px] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center space-y-4">
              <RefreshCw size={48} className="text-slate-200" />
              <div className="space-y-2">
                 <h3 className="text-xl font-black text-slate-800">Module Under Construction</h3>
                 <p className="text-sm text-slate-500 max-w-sm mx-auto">This settings tab is part of our upcoming maintenance cycle. Profile, Hardware, Payments and AI controls are fully active.</p>
              </div>
           </div>
        )}
      </div>

      {/* AI Provider Modal */}
      {isAIModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
           <div className="bg-white rounded-[56px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center">
                 <h3 className="text-2xl font-black tracking-tight uppercase">AI Provider</h3>
                 <button onClick={() => setIsAIModalOpen(false)} className="p-3 hover:bg-white/10 rounded-full transition-all"><X size={28} /></button>
              </div>
              <form onSubmit={handleSaveAIProvider} className="p-10 space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Service Provider</label>
                    <select 
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none"
                      value={aiForm.provider_name}
                      onChange={e => setAiForm({...aiForm, provider_name: e.target.value as any})}
                    >
                       <option value="gemini">Google Gemini</option>
                       <option value="openai">OpenAI ChatGPT</option>
                       <option value="claude">Anthropic Claude</option>
                       <option value="openrouter">OpenRouter</option>
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Model Name</label>
                    <input 
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500" 
                      placeholder="e.g. gemini-3-pro-preview / gpt-4o" 
                      value={aiForm.model}
                      onChange={e => setAiForm({...aiForm, model: e.target.value})}
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">API Key</label>
                    <input 
                      type="password"
                      required={!aiForm.id}
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500" 
                      placeholder="••••••••••••••••" 
                      value={aiForm.api_key}
                      onChange={e => setAiForm({...aiForm, api_key: e.target.value})}
                    />
                    <p className="text-[9px] text-slate-400 font-medium italic">Keys are stored securely and never exposed to the client.</p>
                 </div>
                 {aiForm.provider_name === 'openrouter' && (
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base URL (Optional)</label>
                      <input 
                        className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500" 
                        placeholder="https://openrouter.ai/api/v1" 
                        value={aiForm.base_url}
                        onChange={e => setAiForm({...aiForm, base_url: e.target.value})}
                      />
                   </div>
                 )}
                 <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
                        <div>
                          <p className="font-black text-emerald-900 text-sm">Active</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setAiForm({...aiForm, is_active: !aiForm.is_active})}
                          className={`w-12 h-6 rounded-full transition-all relative ${aiForm.is_active ? 'bg-emerald-600' : 'bg-slate-300'}`}
                        >
                          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all ${aiForm.is_active ? 'right-0.5' : 'left-0.5'}`}></div>
                        </button>
                    </div>
                    <div className="flex items-center justify-between p-6 bg-indigo-50 rounded-3xl border border-indigo-100">
                        <div>
                          <p className="font-black text-indigo-900 text-sm">Default</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setAiForm({...aiForm, is_default: !aiForm.is_default})}
                          className={`w-12 h-6 rounded-full transition-all relative ${aiForm.is_default ? 'bg-indigo-600' : 'bg-slate-300'}`}
                        >
                          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all ${aiForm.is_default ? 'right-0.5' : 'left-0.5'}`}></div>
                        </button>
                    </div>
                 </div>
                 <button type="submit" disabled={loading} className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />} 
                    Save Configuration
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* Printer Registry Modal */}
      {isRegistryModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
           <div className="bg-white rounded-[56px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center">
                 <div>
                    <h3 className="text-2xl font-black tracking-tight uppercase">Register Hardware</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Peripheral Provisioning</p>
                 </div>
                 <button onClick={() => setIsRegistryModalOpen(false)} className="p-3 hover:bg-white/10 rounded-full transition-all"><X size={28} /></button>
              </div>
              
              <form onSubmit={handleSavePrinter} className="p-10 space-y-8">
                 <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                       {(['LAN', 'BLUETOOTH', 'USB', 'SYSTEM'] as const).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setRegistryForm({...registryForm, printer_type: type, connection_hint: ''})}
                            className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${registryForm.printer_type === type ? 'bg-indigo-50 border-indigo-600 text-indigo-600' : 'bg-slate-50 border-transparent text-slate-400'}`}
                          >
                             {type === 'LAN' && <Network size={20} />}
                             {type === 'BLUETOOTH' && <Bluetooth size={20} />}
                             {type === 'USB' && <Usb size={20} />}
                             {type === 'SYSTEM' && <Cpu size={20} />}
                             <span className="text-[10px] font-black uppercase tracking-widest">{type}</span>
                          </button>
                       ))}
                    </div>

                    <div className="space-y-4">
                       <button 
                         type="button"
                         onClick={startHardwarePairing}
                         disabled={isScanning}
                         className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black uppercase tracking-widest text-[10px] border-2 border-dashed border-indigo-200 hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                       >
                          {isScanning ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                          {isScanning ? 'Scanning Network...' : `Search for ${registryForm.printer_type} Devices`}
                       </button>

                       {discoveredDevices.length > 0 && (
                          <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-hide">
                             {discoveredDevices.map(device => (
                                <button
                                  key={device.technical_id}
                                  type="button"
                                  onClick={() => handleSelectDevice(device)}
                                  className="w-full p-4 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center justify-between transition-all"
                                >
                                   <div className="text-left">
                                      <p className="font-bold text-slate-800 text-xs">{device.name}</p>
                                      <p className="text-[9px] text-slate-400 font-mono">{device.technical_id}</p>
                                   </div>
                                   <ChevronRight size={16} className="text-slate-300" />
                                </button>
                             ))}
                          </div>
                       )}
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Printer Name</label>
                       <input 
                         required
                         className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500" 
                         placeholder="e.g. Main Counter / Kitchen 1" 
                         value={registryForm.name}
                         onChange={e => setRegistryForm({...registryForm, name: e.target.value})}
                       />
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Connection Hint (IP/MAC/ID)</label>
                       <input 
                         required
                         className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500 font-mono" 
                         placeholder="192.168.1.100" 
                         value={registryForm.connection_hint}
                         onChange={e => setRegistryForm({...registryForm, connection_hint: e.target.value})}
                       />
                    </div>
                 </div>

                 <button type="submit" disabled={loading} className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />} 
                    Finalize Registration
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* Payment Mode Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
           <div className="bg-white rounded-[56px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center">
                 <h3 className="text-2xl font-black tracking-tight uppercase">Payment Channel</h3>
                 <button onClick={() => setIsPaymentModalOpen(false)} className="p-3 hover:bg-white/10 rounded-full transition-all"><X size={28} /></button>
              </div>
              <form onSubmit={handleSavePaymentMode} className="p-10 space-y-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Public Name</label>
                    <input 
                      required className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500" 
                      placeholder="e.g. PhonePe / QR" 
                      value={mopForm.name}
                      onChange={e => setMopForm({...mopForm, name: e.target.value})}
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Channel Type</label>
                    <select 
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none"
                      value={mopForm.type}
                      onChange={e => setMopForm({...mopForm, type: e.target.value as PaymentModeType})}
                    >
                       <option value="CASH">Cash Settlement</option>
                       <option value="DIGITAL">UPI / Digital Wallet</option>
                       <option value="CARD">Debit / Credit Card</option>
                       <option value="OTHER">Others</option>
                    </select>
                 </div>
                 <div className="flex items-center justify-between p-6 bg-indigo-50 rounded-3xl border border-indigo-100">
                    <div>
                       <p className="font-black text-indigo-900 text-sm">Outlet Default</p>
                       <p className="text-[10px] text-indigo-600 font-bold uppercase">Auto-select in POS flow</p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setMopForm({...mopForm, is_default: !mopForm.is_default})}
                      className={`w-14 h-7 rounded-full transition-all relative ${mopForm.is_default ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                       <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all ${mopForm.is_default ? 'right-1' : 'left-1'}`}></div>
                    </button>
                 </div>
                 <button type="submit" disabled={loading} className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />} 
                    Register Payment Channel
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
