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
import { printerService, Printer, DiscoveredDevice, PrinterPreferences, PaperSizeName } from '../services/printerService';
import { useLiveQuery } from 'dexie-react-hooks';
import { initSupabase, testConnection, getSupabase, authService, paymentService, getTenantAuthHeaders } from '../services/supabaseService';
import { getDatabaseVersion, applyMigration, getMigrationFile, MigrationStatus } from '../services/migrationService';
import { aiService } from '../services/aiService';
import { universalAIService } from '../services/UniversalAIService';
import { invoiceBackfillService, InvoiceBackfillCandidate, InvoiceBackfillProgress } from '../services/invoiceBackfillService';
import PromotionStudio from './PromotionStudio';
import Webhooks from './Webhooks'
import PermissionSelector from './PermissionSelector';
import { resolvePtr } from 'dns/promises';
import { API_BASE } from "../services/config"


type SettingsTab = 'profile' | 'hardware' | 'payments' | 'promotions' | 'alerts' | 'ai' | 'cloud' | 'database' | 'api_keys' | 'integrations';

interface SettingsProps {
  org: Organization | null;
  onUpdateOrg: (updates: Partial<Organization>) => void;
  onClearCache?: () => Promise<void>;
  activeOutlet?: Outlet | null;
}
    const AI_PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI ChatGPT' },
  { value: 'claude', label: 'Anthropic Claude' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'perplexity', label: 'Perplexity' },
  { value: 'hermes', label: 'Hermes' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'xai', label: 'xAI / Grok' },
  { value: 'ollama', label: 'Ollama / Local' },
  { value: 'custom', label: 'Other / Custom' },
];


const KNOWN_AI_PROVIDER_VALUES = new Set(
  AI_PROVIDER_OPTIONS
    .map(option => option.value)
    .filter(value => value !== 'custom')
);
const Settings: React.FC<SettingsProps> = ({ org, onUpdateOrg, onClearCache, activeOutlet }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [registryPrinters, setRegistryPrinters] = useState<Printer[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRegistryModalOpen, setIsRegistryModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [systemPrinters, setSystemPrinters] = useState<DiscoveredDevice[]>([]);
  const [printerPrefs, setPrinterPrefs] = useState<PrinterPreferences | null>(null);
  const [savingPrinterPrefs, setSavingPrinterPrefs] = useState(false);
  const printCapabilities = printerService.getDirectPrintCapabilities();
  const [localPrintAgent, setLocalPrintAgent] = useState<{ available: boolean; message?: string }>({ available: false });
  const directPrintAllowed = printCapabilities.directPrintSupported || localPrintAgent.available;
  const browserPrintRestriction = !directPrintAllowed;
  
  // Cloud Sync States
  const syncConfig = useLiveQuery(() => db.config.get('supabase'));
  const [cloudForm, setCloudForm] = useState({ url: '', key: '', isEnabled: true });
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  // AI States
  const [isKillSwitchOn, setIsKillSwitchOn] = useState(org?.ai_kill_switch || false);
  const [aiProviders, setAiProviders] = useState<AIProvider[]>([]);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isTestingAIProvider, setIsTestingAIProvider] = useState(false);
  const [aiProviderTestStatus, setAiProviderTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [aiProviderTestMessage, setAiProviderTestMessage] = useState('');
  const [aiForm, setAiForm] = useState<Partial<AIProvider>>({
    provider_name: 'gemini',
    model: '',
    api_key: '',
    base_url: '',
    is_active: false,
    is_default: false
  });
  const aiProviderSelectValue = aiForm.provider_name && KNOWN_AI_PROVIDER_VALUES.has(aiForm.provider_name) ? aiForm.provider_name : 'custom';

  // Migration States
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [applyingMigration, setApplyingMigration] = useState<number | null>(null);
  const [resyncBeforeDate, setResyncBeforeDate] = useState('');
  const [resyncOnlyMissing, setResyncOnlyMissing] = useState(true);
  const [resyncDryRun, setResyncDryRun] = useState(false);
  const [resyncSingleInvoiceId, setResyncSingleInvoiceId] = useState('');
  const [resyncPreview, setResyncPreview] = useState<{ total: number; totalItems: number; invoices: InvoiceBackfillCandidate[] } | null>(null);
  const [selectedResyncInvoiceIds, setSelectedResyncInvoiceIds] = useState<string[]>([]);
  const [resyncProgress, setResyncProgress] = useState<InvoiceBackfillProgress>({
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    logs: [],
    running: false,
  });

  // API Keys UI state
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeySelectedPermissions, setNewKeySelectedPermissions] = useState<string[]>([]);
  const [newKeyRateLimit, setNewKeyRateLimit] = useState<number | null>(null);
  const [newKeyOutletIds, setNewKeyOutletIds] = useState<string[]>(activeOutlet?.id ? [activeOutlet.id] : []);
  const [createdKeyModalOpen, setCreatedKeyModalOpen] = useState(false);
  const [createdKeyValue, setCreatedKeyValue] = useState<string | null>(null);
  const [createdKeyMask, setCreatedKeyMask] = useState<string | null>(null);
  const [outletsList, setOutletsList] = useState<{id:string,name:string}[]>([]);

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
      loadPrinterPreferences();
    }
    if (activeTab === 'hardware' && printCapabilities.platform === 'BROWSER') {
      printerService.getLocalPrintAgentStatus().then(status => {
        setLocalPrintAgent({ available: status.available, message: status.message });
      }).catch(() => {
        setLocalPrintAgent({ available: false, message: 'Local print agent is offline.' });
      });
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
    if (activeTab === 'api_keys') {
      loadApiKeys();
      loadOutlets();
    }
  }, [activeOutlet, activeTab, syncConfig, org]);

  useEffect(() => {
    if (!activeOutlet?.id) return;
    setRegistryForm(prev => ({ ...prev, outlet_id: activeOutlet.id }));
    setPrinterPrefs(prev => prev && prev.outlet_id === activeOutlet.id ? prev : {
      outlet_id: activeOutlet.id,
      bill_printer_ids: [],
      bill_paper_size: null,
      bill_auto_print: false,
      kot_printer_ids: [],
      kot_paper_size: null,
      kot_auto_print: true
    });
  }, [activeOutlet?.id]);

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

  const loadApiKeys = async () => {
    if (!org) return;
    setLoading(true);
    try {
      const headers = await getTenantAuthHeaders();

      const resp = await fetch(`${API_BASE}/api/settings/api-keys/list`, { headers });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Failed to fetch')
      //setApiKeys(data || [])
    setApiKeys(Array.isArray(data?.data) ? data.data : [])
    } catch (e:any) {
      console.error('Failed to load api keys', e)
    } finally { setLoading(false) }
  }

  const loadOutlets = async () => {
    if (!org) return
    setLoading(true)
    try {
      const client = getSupabase()
      const { data, error } = await client.from('outlets').select('id,name').eq('company_id', org.id)
      if (!error) setOutletsList(data || [])
    } catch (e:any) {
      console.error('Failed to load outlets', e)
    } finally { setLoading(false) }
  }

  // Handlers extracted from JSX to avoid large inline functions
  const handleCreateKey = async () => {
    if (!newKeyName) return alert('Name required')
    if (!newKeyOutletIds || newKeyOutletIds.length === 0) return alert('Select at least one outlet')
    setCreatingKey(true)
    try {
      const headers = await getTenantAuthHeaders({'Content-Type': 'application/json'})
      const body = {
        name: newKeyName,
        description: '',
        outlet_ids: newKeyOutletIds.length ? newKeyOutletIds : (activeOutlet && activeOutlet.id ? [activeOutlet.id] : []),
        permissions: newKeySelectedPermissions,
        rate_limit: newKeyRateLimit || undefined,
        rate_limit_window: 'day'
      }
      console.log('body',body)
      const resp = await fetch(`${API_BASE}/api/settings/api-keys`, { method: 'POST', headers, body: JSON.stringify(body) })
      console.log('resp',resp)
      const data = await resp.json()
      console.log('data',data)
      if (!resp.ok) throw new Error(data?.error || 'Failed')
      setCreatedKeyValue(data?.api_key || null)
      setCreatedKeyMask(data?.api_key_mask || null)
      setCreatedKeyModalOpen(true)
      setNewKeyName('')
      setNewKeySelectedPermissions([])
      setNewKeyRateLimit(null)
      setNewKeyOutletIds([])
      await loadApiKeys()
    } catch (e:any) { alert(e.message || e) } finally { setCreatingKey(false) }
  }

  const handleRegenerate = async (id: string) => {
    if (!confirm('Regenerate key? this will invalidate the old key')) return
    try {
      const headers = await getTenantAuthHeaders({'Content-Type': 'application/json'})
      const resp = await fetch(`${API_BASE}/api/settings/api-keys/${id}/regenerate`, { method: 'POST', headers })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed')
      setCreatedKeyValue(data?.api_key || null)
      setCreatedKeyMask(data?.api_key_mask || null)
      setCreatedKeyModalOpen(true)
      await loadApiKeys()
    } catch (e:any) { alert(e.message || e) }
  }

  const handleToggle = async (id: string) => {
    try {
      const headers = await getTenantAuthHeaders({'Content-Type': 'application/json'})
      const resp = await fetch(`${API_BASE}/api/settings/api-keys/${id}/toggle`, { method: 'POST', headers })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed')
      }
      await loadApiKeys()
    } catch (e:any) { alert(e.message || e) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete key?')) return
    try {
      const headers = await getTenantAuthHeaders()
      const resp = await fetch(`${API_BASE}/api/settings/api-keys/${id}`, { method: 'DELETE', headers })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed')
      }
      await loadApiKeys()
    } catch (e:any) { alert(e.message || e) }
  }

  const handleCopyCreatedKey = async () => {
    if (createdKeyValue) {
      try {
        await navigator.clipboard.writeText(createdKeyValue)
        alert('Copied to clipboard')
      } catch (e) {
        alert('Copy failed')
      }
    }
  }

  const handleSaveAIProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setLoading(true);
    try {
      const client = getSupabase();
      const normalizedProviderName = String(aiForm.provider_name || '').trim().toLowerCase();
      if (!normalizedProviderName) throw new Error("Provider name is required");

      if (aiForm.is_default) {
        const defaultProviderIds = aiProviders
          .filter(provider => provider.is_default && provider.id !== aiForm.id)
          .map(provider => provider.id);

        if (defaultProviderIds.length > 0) {
          const { error: resetDefaultError } = await client
            .from('ai_providers')
            .upsert(defaultProviderIds.map(id => ({
              id,
              is_default: false,
              updated_at: new Date().toISOString()
            })));

          if (resetDefaultError) throw resetDefaultError;
        }
      }

      const payload: any = {
        company_id: org.id,
        provider_name: normalizedProviderName,
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

  const handleTestAIProvider = async () => {
    const providerName = String(aiForm.provider_name || '').trim().toLowerCase();
    if (!providerName) return alert("Provider name is required");
    if (!aiForm.model) return alert("Model name is required");
    if (!aiForm.api_key) return alert("API key is required to test");

    setIsTestingAIProvider(true);
    setAiProviderTestStatus('idle');
    setAiProviderTestMessage('');

    try {
      const result = await universalAIService.generateContent({
        task_type: 'AI_PROVIDER_TEST',
        prompt: 'Reply with exactly: PAPA_AI_OK',
        provider_override: {
          provider_name: providerName,
          model: aiForm.model,
          api_key: aiForm.api_key,
          base_url: aiForm.base_url,
        },
      });

      if (result.error) throw new Error(result.error);

      setAiProviderTestStatus('success');
      setAiProviderTestMessage(`Connected successfully. Response: ${result.text || 'PAPA_AI_OK'}`);
    } catch (err: any) {
      setAiProviderTestStatus('error');
      setAiProviderTestMessage(err.message || 'Connection test failed');
    } finally {
      setIsTestingAIProvider(false);
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

  const loadPrinterPreferences = async () => {
    if (!activeOutlet) return;
    try {
      const [prefs, discoveredSystemPrinters] = await Promise.all([
        printerService.fetchPrinterPreferences(activeOutlet.id),
        printerService.getSystemPrinters()
      ]);
      setPrinterPrefs(prefs);
      setSystemPrinters(discoveredSystemPrinters);
    } catch (e) {
      console.error(e);
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
    } else if (registryForm.printer_type === 'SYSTEM') {
      setIsScanning(true);
      setDiscoveredDevices([]);
      const results = await printerService.getSystemPrinters();
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

  const handleSavePrinterPreferences = async () => {
    if (!activeOutlet || !printerPrefs) return;
    setSavingPrinterPrefs(true);
    try {
      const normalizedPrefs = printerService.applyRuntimePrintRestrictions({
        ...printerPrefs,
        bill_paper_size: printerPrefs.bill_paper_size || getPrinterPaperSizes(printerPrefs.bill_printer_ids)[0],
        kot_paper_size: printerPrefs.kot_paper_size || getPrinterPaperSizes(printerPrefs.kot_printer_ids)[0],
      }, { browserDirectPrintEnabled: directPrintAllowed });
      const saved = await printerService.savePrinterPreferences(activeOutlet.id, normalizedPrefs);
      setPrinterPrefs(saved);
      alert(browserPrintRestriction ? "Printer routing saved. Browser mode will still use the print dialog until the local print agent is online." : "Printer routing saved.");
    } catch (e: any) {
      alert(`Failed to save printer routing: ${e.message}`);
    } finally {
      setSavingPrinterPrefs(false);
    }
  };

  const updatePrinterPref = <K extends keyof PrinterPreferences>(key: K, value: PrinterPreferences[K]) => {
    setPrinterPrefs(prev => prev ? { ...prev, [key]: value } : prev);
  };

  const togglePrinterSelection = (role: 'bill' | 'kot', printerId: string) => {
    const key = role === 'bill' ? 'bill_printer_ids' : 'kot_printer_ids';
    const selectedIds = printerPrefs?.[key] || [];
    const nextIds = selectedIds.includes(printerId)
      ? selectedIds.filter(id => id !== printerId)
      : [...selectedIds, printerId];
    updatePrinterPref(key, nextIds);
  };

  const getPrinterPaperSizes = (printerIds: string[]) => {
    const selectedPrinters = registryPrinters.filter(printer => printer.id && printerIds.includes(printer.id));
    const sizes = selectedPrinters.flatMap(printer => {
      const matchedSystemPrinter = systemPrinters.find(systemPrinter => systemPrinter.name === printer.name || systemPrinter.technical_id === printer.connection_hint);
      return matchedSystemPrinter?.paper_sizes || [];
    });
    const fallbackSystemSizes = [...new Set(systemPrinters.flatMap(printer => printer.paper_sizes || []).filter(Boolean))];
    const uniqueSizes = [...new Set(sizes.filter(Boolean))];
    return uniqueSizes.length ? uniqueSizes : (fallbackSystemSizes.length ? fallbackSystemSizes : ['A4', 'A3', '58mm', '80mm', '85mm']);
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
      
      const response = await fetch(`${window.location.origin}/${fileName}?v=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${fileName}`);
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

  const buildResyncOptions = (dryRunOverride = resyncDryRun) => ({
    beforeDate: resyncBeforeDate || undefined,
    onlyMissingItems: resyncOnlyMissing,
    dryRun: dryRunOverride,
    singleInvoiceId: resyncSingleInvoiceId.trim() || undefined,
    selectedInvoiceIds: selectedResyncInvoiceIds,
    concurrency: 10,
  });

  const handlePreviewInvoiceResync = async () => {
    setLoading(true);
    try {
      const preview = await invoiceBackfillService.preview(buildResyncOptions(true));
      setResyncPreview(preview);
      setSelectedResyncInvoiceIds(preview.invoices.map(invoice => invoice.invoice_id));
    } catch (e: any) {
      alert(`Preview failed: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunInvoiceResync = async () => {
    if (resyncPreview && selectedResyncInvoiceIds.length === 0) {
      alert("Select at least one invoice to re-sync.");
      return;
    }

    if (!confirm("This will re-sync old invoice items. Continue?")) return;

    setResyncPreview(null);
    setResyncProgress(prev => ({ ...prev, running: true, logs: [] }));

    try {
      const finalProgress = await invoiceBackfillService.run({
        ...buildResyncOptions(resyncDryRun),
        onProgress: setResyncProgress,
      });
      setResyncProgress(finalProgress);
    } catch (e: any) {
      alert(`Re-sync failed: ${e.message || e}`);
      setResyncProgress(prev => ({ ...prev, running: false }));
    }
  };

  const toggleResyncInvoice = (invoiceId: string) => {
    setSelectedResyncInvoiceIds(prev => (
      prev.includes(invoiceId)
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    ));
  };

  const setAllResyncInvoicesSelected = (selected: boolean) => {
    setSelectedResyncInvoiceIds(selected && resyncPreview ? resyncPreview.invoices.map(invoice => invoice.invoice_id) : []);
  };

  const resetResyncPreviewSelection = () => {
    setResyncPreview(null);
    setSelectedResyncInvoiceIds([]);
  };

  const renderDatabase = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="p-4 rounded-[24px] bg-amber-50 text-amber-600">
              <Database size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Maintenance</h3>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">One-time repair tools for historical data</p>
            </div>
          </div>
          <button
            onClick={handlePreviewInvoiceResync}
            disabled={loading || resyncProgress.running}
            className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <ListFilter size={18} />}
            Dry Count
          </button>
        </div>

        <div className="rounded-[32px] border border-amber-200 bg-amber-50 p-6 space-y-5">
          <div className="flex items-start gap-4">
            <AlertTriangle size={22} className="text-amber-600 mt-1" />
            <div>
              <p className="font-black text-slate-900">Re-sync Old Invoices</p>
              <p className="text-xs font-bold text-slate-600 mt-1">Backfills local invoice items into the server with duplicate-safe upsert. Current invoice sync stays unchanged.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Before Date</label>
              <input
                type="date"
                value={resyncBeforeDate}
                onChange={e => {
                  setResyncBeforeDate(e.target.value);
                  resetResyncPreviewSelection();
                }}
                className="w-full px-4 py-3 bg-white rounded-2xl border border-amber-100 font-bold outline-none"
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Single Invoice</label>
              <input
                value={resyncSingleInvoiceId}
                onChange={e => {
                  setResyncSingleInvoiceId(e.target.value);
                  resetResyncPreviewSelection();
                }}
                placeholder="Optional invoice id"
                className="w-full px-4 py-3 bg-white rounded-2xl border border-amber-100 font-mono text-xs font-bold outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleRunInvoiceResync}
                disabled={resyncProgress.running}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50"
              >
                {resyncProgress.running ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                Re-sync Old Invoices
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-amber-100 text-xs font-black text-slate-700">
              <input
                type="checkbox"
                checked={resyncOnlyMissing}
                onChange={e => {
                  setResyncOnlyMissing(e.target.checked);
                  resetResyncPreviewSelection();
                }}
                className="h-4 w-4"
              />
              Only invoices with missing items
            </label>
            <label className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-amber-100 text-xs font-black text-slate-700">
              <input
                type="checkbox"
                checked={resyncDryRun}
                onChange={e => setResyncDryRun(e.target.checked)}
                className="h-4 w-4"
              />
              Dry Run
            </label>
          </div>

          {resyncPreview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-2xl p-4 border border-amber-100">
                  <p className="text-[10px] font-black uppercase text-slate-400">Unsynced Invoices</p>
                  <p className="text-2xl font-black text-slate-900">{resyncPreview.total}</p>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-amber-100">
                  <p className="text-[10px] font-black uppercase text-slate-400">Unsynced Items</p>
                  <p className="text-2xl font-black text-slate-900">{resyncPreview.totalItems}</p>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-amber-100">
                  <p className="text-[10px] font-black uppercase text-slate-400">Selected Invoices</p>
                  <p className="text-2xl font-black text-slate-900">{selectedResyncInvoiceIds.length}</p>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-amber-100">
                  <p className="text-[10px] font-black uppercase text-slate-400">Selected Items</p>
                  <p className="text-2xl font-black text-slate-900">
                    {resyncPreview.invoices
                      .filter(invoice => selectedResyncInvoiceIds.includes(invoice.invoice_id))
                      .reduce((sum, invoice) => sum + invoice.item_count, 0)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-white overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
                  <div>
                    <p className="font-black text-slate-900 text-sm">Candidate Invoices</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Select or deselect records before running</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAllResyncInvoicesSelected(true)}
                      className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllResyncInvoicesSelected(false)}
                      className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {resyncPreview.invoices.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs font-black uppercase tracking-widest text-slate-300">No unsynced invoice items found</div>
                  ) : (
                    resyncPreview.invoices.map(invoice => {
                      const selected = selectedResyncInvoiceIds.includes(invoice.invoice_id);
                      return (
                        <label key={invoice.invoice_id} className={`flex items-center justify-between gap-4 px-4 py-3 border-b border-slate-50 last:border-b-0 cursor-pointer ${selected ? 'bg-emerald-50/70' : 'bg-white'}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleResyncInvoice(invoice.invoice_id)}
                              className="h-4 w-4 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="font-black text-slate-900 text-sm truncate">{invoice.invoice_number || invoice.invoice_id}</p>
                              <p className="font-mono text-[10px] text-slate-400 truncate">{invoice.invoice_id}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-black text-slate-700">{invoice.item_count} items</p>
                            <p className="text-[10px] font-bold text-slate-400">
                              {invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString() : 'No date'}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ['Total', resyncProgress.total],
              ['Processed', resyncProgress.processed],
              ['Success', resyncProgress.success],
              ['Failed', resyncProgress.failed],
              ['Skipped', resyncProgress.skipped],
            ].map(([label, value]) => (
              <div key={label} className="bg-white rounded-2xl p-4 border border-amber-100">
                <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
                <p className="text-2xl font-black text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {resyncProgress.logs.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-2xl border border-amber-100 bg-white">
              {resyncProgress.logs.map((log, index) => (
                <div key={`${log.invoice_id}-${index}`} className="flex flex-col md:flex-row md:items-center justify-between gap-2 px-4 py-3 border-b border-slate-50 last:border-b-0">
                  <div>
                    <p className="font-mono text-xs font-black text-slate-800">{log.invoice_id}</p>
                    {log.error && <p className="text-[11px] font-bold text-rose-600 mt-1">{log.error}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-slate-400">{log.items_synced} items</span>
                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                      log.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                      log.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{log.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {migrationStatus && (
          <div className="rounded-[32px] border border-slate-100 bg-slate-50 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="font-black text-slate-900">Database Version {migrationStatus.currentVersion || 0}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {migrationStatus.pendingVersions.length ? `${migrationStatus.pendingVersions.length} migrations pending` : 'Database schema is current'}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={loadMigrationStatus} className="px-4 py-2 bg-white rounded-xl border text-xs font-black uppercase tracking-widest">Refresh</button>
              {migrationStatus.pendingVersions.slice(0, 3).map(version => (
                <button
                  key={version}
                  onClick={() => handleApplyMigration(version)}
                  disabled={applyingMigration === version}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {applyingMigration === version ? 'Applying' : `Apply ${version}`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

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

                <div className="p-8 rounded-[32px] border-2 bg-indigo-50 border-indigo-100">
                   <div className="flex items-center gap-3 mb-4">
                      <Cpu className="text-indigo-600" size={24} />
                      <div>
                         <p className="font-black text-slate-800 text-sm">Central AI Router</p>
                         <p className="text-[10px] text-slate-500 font-bold uppercase">Deep POS automation control plane</p>
                      </div>
                   </div>
                   <p className="text-xs font-medium text-slate-600 leading-relaxed italic">
                     PapaPOS now routes AI tasks through a central backend control plane. Multiple active providers can stay online together, the default provider is tried first, and the system can automatically fail over to other active providers if one service goes down.
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
                            {provider.base_url && <p className="text-[9px] font-bold text-slate-300">{provider.base_url}</p>}
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
         <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
               <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Bill & KOT Routing</h3>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Choose separate printers, paper sizes, and direct-print behavior</p>
               </div>
               <button
                 onClick={handleSavePrinterPreferences}
                 disabled={!printerPrefs || savingPrinterPrefs}
                 className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg disabled:opacity-50"
               >
                 {savingPrinterPrefs ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                 Save Routing
               </button>
            </div>

            <div className={`rounded-[28px] border px-6 py-5 ${directPrintAllowed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-black text-slate-900">Runtime: {printCapabilities.platform}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">
                    {printCapabilities.platform === 'BROWSER' ? (localPrintAgent.message || printCapabilities.message) : printCapabilities.message}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className={`px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest ${directPrintAllowed ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>Direct Print {directPrintAllowed ? 'On' : 'Off'}</span>
                  <span className={`px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest ${printCapabilities.bluetoothDirectSupported ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>Bluetooth {printCapabilities.bluetoothDirectSupported ? 'Supported' : 'Dialog Only'}</span>
                  {printCapabilities.platform === 'BROWSER' && (
                    <span className={`px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest ${localPrintAgent.available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      Local Agent {localPrintAgent.available ? 'Ready' : 'Offline'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {!activeOutlet || !printerPrefs ? (
              <div className="py-16 text-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[32px]">
                <p className="font-black uppercase text-xs">Select outlet to manage printer routing</p>
              </div>
            ) : (
              <div className="grid xl:grid-cols-2 gap-6">
                {[
                  {
                    key: 'bill',
                    title: 'Bill Printer',
                    desc: 'Customer invoice output',
                    printerIds: printerPrefs.bill_printer_ids,
                    paperSize: printerPrefs.bill_paper_size,
                    autoPrint: printerPrefs.bill_auto_print,
                  },
                  {
                    key: 'kot',
                    title: 'KOT Printer',
                    desc: 'Kitchen order ticket output',
                    printerIds: printerPrefs.kot_printer_ids,
                    paperSize: printerPrefs.kot_paper_size,
                    autoPrint: printerPrefs.kot_auto_print,
                  },
                ].map(section => (
                  <div key={section.key} className="rounded-[32px] border border-slate-200 bg-slate-50 p-6 space-y-5">
                    <div>
                      <p className="font-black text-slate-900">{section.title}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{section.desc}</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Printers</label>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2 max-h-52 overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => updatePrinterPref(section.key === 'bill' ? 'bill_printer_ids' : 'kot_printer_ids', [])}
                          className={`w-full px-4 py-3 rounded-2xl border text-left text-[10px] font-black uppercase tracking-widest ${
                            section.printerIds.length === 0 ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          Use System Default Printer
                        </button>
                        {registryPrinters.map(printer => (
                          <button
                            key={printer.id}
                            type="button"
                            onClick={() => togglePrinterSelection(section.key as 'bill' | 'kot', printer.id!)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-left ${
                              section.printerIds.includes(printer.id!) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 bg-white'
                            }`}
                          >
                            <span className="font-black text-sm">{printer.name}</span>
                            <span className="text-[10px] font-black uppercase tracking-widest">{section.printerIds.includes(printer.id!) ? 'Selected' : 'Tap to add'}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Print Size</label>
                      <select
                        value={section.paperSize || getPrinterPaperSizes(section.printerIds)[0]}
                        onChange={e => updatePrinterPref(
                          section.key === 'bill' ? 'bill_paper_size' : 'kot_paper_size',
                          e.target.value as PaperSizeName
                        )}
                        className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 font-bold outline-none"
                      >
                        {getPrinterPaperSizes(section.printerIds).map(size => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 font-bold">Sizes shown here come from the selected printer when available.</p>
                    </div>

                    <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white px-5 py-4">
                      <div>
                        <p className="font-black text-slate-900">Direct Print</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {browserPrintRestriction ? 'Requires local print agent or native runtime' : 'Skip in-app preview and send straight to printer'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={browserPrintRestriction}
                        onClick={() => updatePrinterPref(
                          section.key === 'bill' ? 'bill_auto_print' : 'kot_auto_print',
                          !section.autoPrint
                        )}
                        className={`w-14 h-7 rounded-full relative transition-all disabled:cursor-not-allowed disabled:opacity-50 ${section.autoPrint ? 'bg-emerald-600' : 'bg-slate-300'}`}
                      >
                        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${section.autoPrint ? 'right-1' : 'left-1'}`} />
                      </button>
                    </div>
                    {browserPrintRestriction && (
                      <p className="text-[10px] font-bold text-amber-600">
                        Browser direct print needs the local Windows print agent for LAN, USB, or system printers. Bluetooth still needs a native runtime.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
         </div>

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
                            <div className="flex items-center gap-2 flex-wrap">
                               <span className="text-[9px] font-bold text-slate-400 uppercase">{p.printer_type} • {p.connection_hint}</span>
                               {p.is_default && <span className="text-[8px] font-black text-indigo-600 uppercase bg-indigo-100 px-1.5 rounded">Default</span>}
                               {printerPrefs?.bill_printer_ids?.includes(p.id!) && <span className="text-[8px] font-black text-emerald-700 uppercase bg-emerald-100 px-1.5 rounded">Bill</span>}
                               {printerPrefs?.kot_printer_ids?.includes(p.id!) && <span className="text-[8px] font-black text-orange-700 uppercase bg-orange-100 px-1.5 rounded">KOT</span>}
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
         {(['profile', 'hardware', 'payments', 'promotions', 'alerts', 'ai', 'cloud', 'database', 'api_keys', 'integrations'] as SettingsTab[]).map(tab => (
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
        {activeTab === 'promotions' && <PromotionStudio activeOutlet={activeOutlet} />}
        {activeTab === 'ai' && renderAIControl()}
        {activeTab === 'database' && renderDatabase()}
        {activeTab === 'api_keys' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-100">
            <h3 className="text-xl font-black">API Keys</h3>
            <p className="text-sm text-slate-500">Manage service API keys used by integrations and devices.</p>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-4 gap-3 items-center">
                <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Key name (eg. kitchen-printer)" className="col-span-1 px-4 py-3 rounded-lg border" />
                <div className="col-span-1">
                  {/* Permission selector replaces free-text input */}
                </div>
                <input value={newKeyRateLimit ?? ''} onChange={e => setNewKeyRateLimit(Number(e.target.value) || null)} placeholder="rate limit (per day)" className="col-span-1 px-4 py-3 rounded-lg border" />
                <select multiple value={newKeyOutletIds} onChange={e => setNewKeyOutletIds(Array.from(e.target.selectedOptions).map(o => o.value))} className="col-span-1 px-4 py-3 rounded-lg border h-12">
                  {outletsList.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div className="mt-3">
                {/* full-width permission selector */}
                <PermissionSelector selectedPermissions={newKeySelectedPermissions} onChange={setNewKeySelectedPermissions} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => handleCreateKey()} className="px-4 py-3 bg-slate-900 text-white rounded-lg">Create Key</button>
                <button onClick={loadApiKeys} className="px-4 py-3 bg-slate-50 rounded-lg border">Refresh</button>
              </div>
            </div>

            <div className="mt-6">
              <h4 className="font-black text-slate-900">Existing Keys</h4>
              <div className="mt-3 space-y-2">
                {apiKeys.length === 0 && <div className="text-slate-400">No keys registered</div>}
                {apiKeys.map(k => (
                  <div key={k.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-black">{k.name || k.key_mask}</div>
                      <div className="text-[11px] text-slate-500">{k.key_mask} • {k.is_active ? 'active' : 'disabled'} • {k.rate_limit || 'no limit'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleRegenerate(k.id)} className="px-3 py-2 bg-indigo-50 rounded">Regenerate</button>
                      <button onClick={() => handleToggle(k.id)} className="px-3 py-2 bg-slate-50 rounded">Toggle</button>
                      <button onClick={() => handleDelete(k.id)} className="px-3 py-2 bg-rose-50 rounded">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Created Key Modal */}
              {createdKeyModalOpen && (
                <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-slate-900/80">
                  <div className="bg-white rounded-2xl p-6 w-full max-w-md">
                    <h3 className="font-black text-lg">API Key Created</h3>
                    <p className="text-sm text-slate-500 mt-2">This secret will not be shown again. Copy and store it securely.</p>
                    <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                      <div className="font-mono break-words text-sm">{createdKeyValue}</div>
                      {createdKeyMask && <div className="text-[11px] text-slate-400 mt-1">{createdKeyMask}</div>}
                    </div>
                    <div className="flex gap-3 justify-end mt-4">
                      <button onClick={() => handleCopyCreatedKey()} className="px-4 py-2 bg-indigo-600 text-white rounded">Copy</button>
                      <button onClick={() => { setCreatedKeyModalOpen(false); setCreatedKeyValue(null); setCreatedKeyMask(null) }} className="px-4 py-2 bg-slate-100 rounded">Close</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'integrations' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-100">
            <Webhooks />
          </div>
        )}
        {(activeTab === 'alerts' || activeTab === 'cloud') && (
           <div className="bg-white p-20 rounded-[48px] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center space-y-4">
              <RefreshCw size={48} className="text-slate-200" />
              <div className="space-y-2">
                 <h3 className="text-xl font-black text-slate-800">Module Under Construction</h3>
                 <p className="text-sm text-slate-500 max-w-sm mx-auto">This settings tab is part of our upcoming maintenance cycle. Profile, Hardware, Payments and AI controls are fully active.</p>
              </div>
           </div>
        )
        }
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
                      value={aiProviderSelectValue}
                      onChange={e => setAiForm({
                        ...aiForm,
                        provider_name: e.target.value === 'custom' ? '' : e.target.value
                      })}
                    >
                       {AI_PROVIDER_OPTIONS.map(option => (
                         <option key={option.value} value={option.value}>{option.label}</option>
                       ))}
                    </select>
                 </div>
                 {aiProviderSelectValue === 'custom' && (
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custom Provider Key</label>
                      <input 
                        className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500" 
                        placeholder="e.g. perplexity / hermes / local-gateway" 
                        value={aiForm.provider_name || ''}
                        onChange={e => setAiForm({...aiForm, provider_name: e.target.value})}
                      />
                      <p className="text-[9px] text-slate-400 font-medium italic">Use this for any provider name not listed above. Pair it with the correct base URL and model.</p>
                   </div>
                 )}
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
                 {aiProviderSelectValue !== 'gemini' && (
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base URL {aiProviderSelectValue === 'claude' ? '(Optional)' : '(Recommended for custom-compatible providers)'}</label>
                      <input 
                        className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-indigo-500" 
                        placeholder={
                          aiProviderSelectValue === 'openai' ? 'https://api.openai.com/v1/chat/completions' :
                          aiProviderSelectValue === 'claude' ? 'https://api.anthropic.com/v1/messages' :
                          aiProviderSelectValue === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
                          aiProviderSelectValue === 'perplexity' ? 'https://api.perplexity.ai/chat/completions' :
                          aiProviderSelectValue === 'ollama' ? 'http://localhost:11434/v1/chat/completions' :
                          'https://your-provider-endpoint/v1/chat/completions'
                        } 
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
                 <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleTestAIProvider}
                      disabled={isTestingAIProvider}
                      className="w-full py-4 bg-indigo-50 text-indigo-700 rounded-[24px] font-black uppercase tracking-widest text-xs border border-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isTestingAIProvider ? <Loader2 className="animate-spin" size={18} /> : <Activity size={18} />}
                      Test Connection
                    </button>
                    {aiProviderTestStatus !== 'idle' && (
                      <div className={`p-4 rounded-2xl text-xs font-bold ${aiProviderTestStatus === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                        {aiProviderTestMessage}
                      </div>
                    )}
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
