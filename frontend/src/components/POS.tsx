
import React, { useState, useEffect, useMemo } from 'react';
import { MenuItem, Table, OrderType, Invoice, CartItem, PaymentMode, Modifier } from '../types';
import { 
  ShoppingCart, Search, Trash2, Plus, Minus, Receipt, 
  X, Utensils, Info, WifiOff, Wifi,
  MonitorPlay, ChevronRight, Check, AlertCircle, Loader2,
  ChevronLeft, ShoppingBag, Printer, QrCode, User, CreditCard, Wallet, Banknote,
  Settings2, Mic, MicOff, Sparkles, Maximize, Minimize
} from 'lucide-react';
import { salesService } from '../services/salesService';
import { kitchenService } from '../services/kitchenService';
import { recipeService } from '../services/recipeService';
import { sessionService } from '../services/sessionService';
import { paymentService, inventoryService } from '../services/supabaseService';
import { printerService, Printer as RegisteredPrinter, PrinterPreferences, DiscoveredDevice } from '../services/printerService';
import { db } from '../services/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { processVoiceInput, VoiceCommand } from '../services/voiceAssistantService';
import { GeminiLiveService } from '../services/GeminiLiveService';
import { motion, AnimatePresence } from 'framer-motion';
import { menuService, authService, getSupabase } from '../services/supabaseService';
import { PosPromotions, PromotionActionBar } from './PosPromotions';
import { promotionService } from '../services/promotionService';
import { calculatePromotionPricing } from '../services/promotionEngine';
import type { ComboRule, DiscountRule, ManualDiscountDraft, OfferRule, PromotionConfig } from '../types/promotions';
import { aiService } from '../services/aiService';

// --- Price Integrity Contract ---
interface ValidatedCartItem {
  line_id: string;
  id: string;
  name: string;
  category?: string;
  unit_price: number; // Sanitized, base price
  quantity: number;
  tax_percentage: number;
  price_includes_tax: boolean;
  hsn_code: string;
  total_price: number; // Derived: (unit_price + modifiers_sum) * quantity
  selected_modifiers?: Modifier[];
  combo_id?: string;
  combo_instance_id?: string;
  combo_group_id?: string;
  combo_label?: string;
}

const POS: React.FC<{ org: any; activeOutlet?: any; currentUser?: any }> = ({ org, activeOutlet, currentUser }) => {
  const ORDER_TYPE_STORAGE_KEY = 'papapos.pos.order_type';
  // UI State
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [orderType, setOrderType] = useState<OrderType>(() => {
    try {
      if (typeof window === 'undefined') return 'DINE_IN';
      const raw = window.localStorage.getItem(ORDER_TYPE_STORAGE_KEY);
      if (raw === 'DINE_IN' || raw === 'TAKEAWAY' || raw === 'DELIVERY') return raw;
    } catch (e) {
      console.warn('Failed to read order type preference:', e);
    }
    return 'DINE_IN';
  });
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showTableSelector, setShowTableSelector] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [paperWidth, setPaperWidth] = useState<string>('80mm');
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(true);
  const [isDesktopCategoryOpen, setIsDesktopCategoryOpen] = useState(true);
  const [printerStatus, setPrinterStatus] = useState<{ available: boolean; name: string; type: string } | null>(null);
  const [printReady, setPrintReady] = useState(false);
  const [registeredPrinters, setRegisteredPrinters] = useState<RegisteredPrinter[]>([]);
  const [systemPrinters, setSystemPrinters] = useState<DiscoveredDevice[]>([]);
  const [printPreferences, setPrintPreferences] = useState<PrinterPreferences>({
    outlet_id: '',
    bill_printer_ids: [],
    bill_paper_size: null,
    bill_auto_print: false,
    kot_printer_ids: [],
    kot_paper_size: null,
    kot_auto_print: true,
  });
  const printCapabilities = printerService.getDirectPrintCapabilities();
  const [localPrintAgent, setLocalPrintAgent] = useState<{ available: boolean; message?: string }>({ available: false });
  const directPrintAvailable = printCapabilities.directPrintSupported || localPrintAgent.available;
  const [modifierItem, setModifierItem] = useState<any | null>(null);
  const [tempSelectedModifiers, setTempSelectedModifiers] = useState<Modifier[]>([]);

  // Voice Assistant State
  const [isListening, setIsListening] = useState(false);
  const [isPWA, setIsPWA] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false));
      }
    }
  };
  const [isConversationActive, setIsConversationActive] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [aiStatus, setAiStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' } | null>(null);
  const [currentVoiceState, setCurrentVoiceState] = useState<'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'EXECUTING' | 'WAITING_FOR_CONFIRMATION' | 'EXITING'>('IDLE');
  const [lastInteractionTime, setLastInteractionTime] = useState(Date.now());
  const [liveService, setLiveService] = useState<GeminiLiveService | null>(null);

  const toggleModifier = (mod: Modifier) => {
    setTempSelectedModifiers(prev => 
      prev.find(m => m.id === mod.id) 
        ? prev.filter(m => m.id !== mod.id) 
        : [...prev, mod]
    );
  };
  
  // Payment State
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [selectedMop, setSelectedMop] = useState<PaymentMode | null>(null);

  // E-Invoice / Compliance State
  const [buyerGstin, setBuyerGstin] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerState, setBuyerState] = useState(activeOutlet?.gst_state_code || activeOutlet?.state_code || '27');
  const [lastInvoice, setLastInvoice] = useState<any>(null);

  // --- Cart State ---
  const [cart, setCart] = useState<ValidatedCartItem[]>([]);
  const [activeDiscounts, setActiveDiscounts] = useState<DiscountRule[]>([]);
  const [activeOffers, setActiveOffers] = useState<OfferRule[]>([]);
  const [activeCombos, setActiveCombos] = useState<ComboRule[]>([]);
  const [promotionConfig, setPromotionConfig] = useState<PromotionConfig>({
    max_manual_discount_percent: 20,
    allowed_manual_discount_types: ['FLAT', 'PERCENTAGE'],
    allow_cashier_manual_discount: false,
  });
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const [manualDiscount, setManualDiscount] = useState<ManualDiscountDraft | null>(null);
  const [promotionModal, setPromotionModal] = useState<'combos' | 'offers' | 'discount' | null>(null);
  const showPromotionBox = activeCombos.length > 0 || activeOffers.length > 0 || activeDiscounts.length > 0;

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsPWA(!!isStandalone);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cart.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [cart]);

  useEffect(() => {
    let cancelled = false;

    const bootAIGreeting = async () => {
      if (!activeOutlet?.id) return;
      const killSwitchActive = await aiService.checkKillSwitch();
      if (cancelled || killSwitchActive) return;
      setAiStatus({
        message: `PapaPOS AI ready for ${activeOutlet.name}. I can help you navigate, search, open cart, payments, and tables.`,
        type: 'info'
      });
    };

    bootAIGreeting();
    return () => {
      cancelled = true;
    };
  }, [activeOutlet?.id]);

  // Offline-First Data (Dexie)
  const menuItems = useLiveQuery(() => 
    activeOutlet ? db.menu.where('outlet_id').equals(activeOutlet.id).toArray() : Promise.resolve([]), 
    [activeOutlet?.id]
  ) || [];

  const categories = useLiveQuery(() => 
    activeOutlet ? db.categories.where('outlet_id').equals(activeOutlet.id).toArray() : Promise.resolve([]),
    [activeOutlet?.id]
  ) || [];

  const tables = useLiveQuery(() => 
    activeOutlet ? db.floor_tables.where('outlet_id').equals(activeOutlet.id).toArray() : Promise.resolve([]),
    [activeOutlet?.id]
  ) || [];

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (orderType !== 'DINE_IN') setSelectedTable(null);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [orderType]);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(ORDER_TYPE_STORAGE_KEY, orderType);
    } catch (e) {
      console.warn('Failed to persist order type preference:', e);
    }
  }, [ORDER_TYPE_STORAGE_KEY, orderType]);

  useEffect(() => {
    if (activeOutlet) {
      loadPaymentModes();
    }
  }, [activeOutlet]);

  useEffect(() => {
    let isMounted = true;

    const loadPrinterSetup = async () => {
      if (!activeOutlet?.id) {
        if (!isMounted) return;
        setRegisteredPrinters([]);
        setSystemPrinters([]);
        setPrintPreferences({
          outlet_id: '',
          bill_printer_ids: [],
          bill_paper_size: null,
          bill_auto_print: false,
          kot_printer_ids: [],
          kot_paper_size: null,
          kot_auto_print: true,
        });
        return;
      }

      try {
        const [printers, prefs, discoveredSystemPrinters] = await Promise.all([
          printerService.fetchPrinters(activeOutlet.id),
          printerService.fetchPrinterPreferences(activeOutlet.id),
          printerService.getSystemPrinters(),
        ]);

        const agentStatus = printCapabilities.platform === 'BROWSER'
          ? await printerService.getLocalPrintAgentStatus()
          : { available: false, message: '' };

        if (!isMounted) return;
        setRegisteredPrinters(printers);
        setSystemPrinters(discoveredSystemPrinters);
        setLocalPrintAgent({ available: Boolean(agentStatus.available), message: agentStatus.message });
        setPrintPreferences(prefs);
        setPaperWidth((prefs.bill_paper_size || '80mm') as any);
      } catch (error) {
        console.error('Printer setup load failure:', error);
      }
    };

    loadPrinterSetup();

    return () => {
      isMounted = false;
    };
  }, [activeOutlet?.id]);

  useEffect(() => {
    let isMounted = true;

    const loadPromotions = async () => {
      if (!activeOutlet?.id) {
        if (isMounted) {
          setActiveDiscounts([]);
          setActiveOffers([]);
          setActiveCombos([]);
        }
        return;
      }

      try {
        const payload = await promotionService.loadActivePromotions(activeOutlet.id);
        if (!isMounted) return;
        setActiveDiscounts(payload.discounts);
        setActiveOffers(payload.offers);
        setActiveCombos(payload.combos);
        setPromotionConfig(payload.config);
      } catch (error) {
        console.error('Promotion load failure:', error);
      }
    };

    loadPromotions();

    return () => {
      isMounted = false;
    };
  }, [activeOutlet?.id]);

  const loadPaymentModes = async () => {
    try {
      const modes = await paymentService.fetchActiveModes(activeOutlet.id);
      setPaymentModes(modes);
      const defaultMode = modes.find(m => m.is_default);
      if (defaultMode) setSelectedMop(defaultMode);
      else if (modes.length > 0) setSelectedMop(modes[0]);
    } catch (e) {
      console.error("MOP Load Failure:", e);
    }
  };

  const addToCart = (
    item: any,
    selectedMods: Modifier[] = [],
    promotionMeta?: Pick<ValidatedCartItem, 'combo_id' | 'combo_instance_id' | 'combo_group_id' | 'combo_label'>
  ) => {
    const rawPrice = item.base_price ?? item.price;
    const sanitizedPrice = Number(
      typeof rawPrice === 'string'
        ? rawPrice.replace(/[^\d.]/g, '')
        : rawPrice
    );

    if (!Number.isFinite(sanitizedPrice) || sanitizedPrice <= 0) {
      setPriceError(`Configuration Error: "${item.name}" has an invalid price.`);
      setTimeout(() => setPriceError(null), 3000);
      return;
    }

    // Determine effective modifiers: item-level first, fallback to category if item inherits
    const itemLevelMods = Array.isArray(item.modifiers) ? item.modifiers : [];
    let effectiveMods = itemLevelMods;

    if ((!effectiveMods || effectiveMods.length === 0) && (item.apply_category_modifiers !== false)) {
      const cat = categories.find(c => c.id === item.category_id || c.name === item.category || (item.menu_categories && item.menu_categories.name === c.name));
      const catMods = cat && Array.isArray(cat.modifiers) ? cat.modifiers : [];
      if (catMods.length > 0) effectiveMods = catMods;
    }

    // If effective modifiers exist and none are passed, open modal with merged modifiers
    if (effectiveMods && effectiveMods.length > 0 && selectedMods.length === 0 && !modifierItem) {
      // Present an item object that includes the effective modifiers so modal renders correctly
      const modalItem = { ...item, modifiers: effectiveMods };
      setModifierItem(modalItem);
      setTempSelectedModifiers([]);
      return;
    }

    const modifierPriceSum = selectedMods.reduce( 
      (sum, mod) => sum + Number(mod.price || 0),
      0
    );


    const effectiveUnitPrice = sanitizedPrice + modifierPriceSum;

    setCart(prev => {
      // For items with modifiers, we treat them as unique entries if modifiers differ
      const existing = prev.find(i => 
        i.id === item.id && 
        JSON.stringify(i.selected_modifiers || []) === JSON.stringify(selectedMods) &&
        i.combo_instance_id === promotionMeta?.combo_instance_id &&
        i.combo_group_id === promotionMeta?.combo_group_id
      );

      if (existing) {
        return prev.map(i => (i.id === item.id && JSON.stringify(i.selected_modifiers || []) === JSON.stringify(selectedMods) && i.combo_instance_id === promotionMeta?.combo_instance_id && i.combo_group_id === promotionMeta?.combo_group_id)
          ? { ...i, quantity: i.quantity + 1, total_price: effectiveUnitPrice * (i.quantity + 1) } 
          : i
        );
      }

      const newItem: ValidatedCartItem = {
        line_id: crypto.randomUUID(),
        id: item.id,
        name: item.name,
        category: item.menu_categories?.name || item.category,
        unit_price: sanitizedPrice,
        quantity: 1,
        tax_percentage: Number(item.tax_percentage ?? item.gst_rate ?? 5),
        //price_includes_tax: Boolean(item.price_includes_tax ?? item.is_tax_inclusive ?? false),
        price_includes_tax: activeOutlet?.is_tax_inclusive ?? false,
        hsn_code: String(item.hsn_code || '9963'),
        total_price: effectiveUnitPrice,
        selected_modifiers: selectedMods.length > 0 ? selectedMods : undefined,
        ...promotionMeta,
      };
      return [...prev, newItem];
    });
    
    setModifierItem(null);
    setTempSelectedModifiers([]);
    if (window.innerWidth > 1024 && !isCartOpen) setIsCartOpen(true);
  };

  const startListening = () => {
    aiService.checkKillSwitch().then(isDisabled => {
      if (isDisabled) {
        setAiStatus({ message: 'AI is disabled by the owner kill switch.', type: 'warning' });
        return;
      }

      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("Speech recognition is not supported in this browser.");
        return;
      }

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;

      recognition.onstart = () => {
        setIsListening(true);
        setCurrentVoiceState('LISTENING');
        setAiStatus({ message: "Say 'Hey Papa' to start...", type: 'info' });
      };

      recognition.onresult = async (event: any) => {
        const result = event.results[event.results.length - 1];
        const transcript = result[0].transcript.trim().toLowerCase();

        if (transcript.includes('hey papa')) {
          recognition.stop();
          startGeminiLive();
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Wake word recognition error:", event.error);
        setIsListening(false);
        setAiStatus({ message: `Error: ${event.error}`, type: 'error' });
      };

      recognition.onend = () => {
        if (!liveService && isListening) {
          setIsListening(false);
          setCurrentVoiceState('IDLE');
        }
      };

      recognition.start();
    });
  };

  const stopListening = () => {
    if (liveService) {
      liveService.disconnect();
      setLiveService(null);
    }
    setIsListening(false);
    setCurrentVoiceState('IDLE');
    setAiStatus(null);
  };

  useEffect(() => {
    return () => {
      if (liveService) liveService.disconnect();
    };
  }, [liveService]);

  const startGeminiLive = async () => {
    if (await aiService.checkKillSwitch()) {
      setAiStatus({ message: 'AI is disabled by the owner kill switch.', type: 'warning' });
      return;
    }

    const service = new GeminiLiveService(menuItems, {
      onStatusChange: (status) => {
        setAiStatus({ message: status, type: 'info' });
        if (status === 'Listening...') setCurrentVoiceState('LISTENING');
      },
      onTranscript: (text, isUser) => {
        if (isUser) setVoiceTranscript(text);
      },
      onToolCall: (name, args) => {
        handleLiveToolCall(name, args);
      },
      onError: (error) => {
        setAiStatus({ message: error, type: 'error' });
        setIsListening(false);
      },
      onClose: () => {
        setIsListening(false);
        setCurrentVoiceState('IDLE');
        setLiveService(null);
      }
    });

    setLiveService(service);
    service.connect();
  };

  const handleLiveToolCall = (name: string, args: any) => {
    setCurrentVoiceState('EXECUTING');
    
    switch (name) {
      case 'addItem':
        const itemToAdd = menuItems.find(i => i.name.toLowerCase() === args.name.toLowerCase());
        if (itemToAdd) {
          const qty = args.quantity || 1;
          for (let i = 0; i < qty; i++) addToCart(itemToAdd);
          setAiStatus({ message: `Added ${qty} ${itemToAdd.name}`, type: 'success' });
        }
        break;
      case 'removeItem':
        const itemToRemove = menuItems.find(i => i.name.toLowerCase() === args.name.toLowerCase());
        if (itemToRemove) {
          const cartItem = cart.find(i => i.id === itemToRemove.id);
          if (cartItem) updateQuantity(itemToRemove.id, -cartItem.quantity, cartItem.selected_modifiers);
          setAiStatus({ message: `Removed ${itemToRemove.name}`, type: 'success' });
        }
        break;
      case 'updateQuantity':
        const itemToUpdate = menuItems.find(i => i.name.toLowerCase() === args.name.toLowerCase());
        if (itemToUpdate) {
          const cartItem = cart.find(i => i.id === itemToUpdate.id);
          if (cartItem) {
            const delta = args.quantity - cartItem.quantity;
            updateQuantity(itemToUpdate.id, delta, cartItem.selected_modifiers);
            setAiStatus({ message: `Updated ${itemToUpdate.name} to ${args.quantity}`, type: 'success' });
          }
        }
        break;
      case 'confirmBill':
        handleFinalizeAndPrint();
        break;
      case 'openCart':
        setIsCartOpen(true);
        setAiStatus({ message: 'Opened the cart for you.', type: 'success' });
        break;
      case 'openPayments':
        setShowPaymentPicker(true);
        setAiStatus({ message: 'Opened payment mode picker.', type: 'success' });
        break;
      case 'showTables':
        setOrderType('DINE_IN');
        setShowTableSelector(true);
        setAiStatus({ message: 'Showing table selector.', type: 'success' });
        break;
      case 'focusSearch':
        setSearchQuery(String(args?.query || ''));
        setAiStatus({ message: `Searching for ${String(args?.query || 'items')}.`, type: 'success' });
        break;
    }
  };
  const updateQuantity = (id: string, delta: number, modifiers?: Modifier[], lineId?: string) => {
    setCart(prev => prev.map(item => {
      const match = lineId
        ? item.line_id === lineId
        : item.id === id && JSON.stringify(item.selected_modifiers || []) === JSON.stringify(modifiers || []);
      if (match) {
        const newQty = Math.max(0, item.quantity + delta);
        const modifierPriceSum = (item.selected_modifiers || []).reduce((sum, mod) => sum + Number(mod.price || 0), 0);
        const effectiveUnitPrice = item.unit_price + modifierPriceSum;
        return { ...item, quantity: newQty, total_price: effectiveUnitPrice * newQty };
      }
      return item;
    }).filter(i => i.quantity > 0));
  };

  const validateCompliance = () => {
    if (activeOutlet?.gst_registered && !activeOutlet?.gst_number) {
      alert("Error: Outlet is GST registered but GSTIN is missing. Compliance blocked.");
      return false;
    }
    if (!selectedMop) {
      alert("Error: No Payment Mode selected. Please configure a default in settings.");
      return false;
    }
    if (buyerGstin) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(buyerGstin)) {
        alert("Error: Invalid Buyer GSTIN format.");
        return false;
      }
    }
    return true;
  };

  const legacyTotals = useMemo(() => {
    const outletState = activeOutlet?.gst_state_code || activeOutlet?.state_code || '27';
    const destState = buyerState || outletState;
    const gstRegistered = activeOutlet?.gst_registered ?? false;
    
    const processed = cart.map(item => {
    return salesService.calculateItemGst(
    {
      ...item,
      price: item.unit_price,          // 🔑 KEY FIX
      base_price: item.unit_price,     // 🔑 BACKWARD COMPAT
    } as any,
    item.quantity,
    outletState,
    destState,
    gstRegistered,
    item.selected_modifiers
  );
});
    const subtotal = processed.reduce((acc, i) => acc + (i.taxable_value || 0), 0);
    const cgst = processed.reduce((acc, i) => acc + (i.cgst_amount || 0), 0);
    const sgst = processed.reduce((acc, i) => acc + (i.sgst_amount || 0), 0);
    const igst = processed.reduce((acc, i) => acc + (i.igst_amount || 0), 0);
    const totalTax = cgst + sgst + igst;
    
    // Grouped tax for breakup view
    const taxBreakup: Record<number, { taxable: number, cgst: number, sgst: number, igst: number, totalTax: number }> = {};
    processed.forEach(i => {
      const rate = i.tax_percentage;
      if (!taxBreakup[rate]) taxBreakup[rate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
      taxBreakup[rate].taxable += i.taxable_value;
      taxBreakup[rate].cgst += i.cgst_amount;
      taxBreakup[rate].sgst += i.sgst_amount;
      taxBreakup[rate].igst += i.igst_amount;
      taxBreakup[rate].totalTax += (i.cgst_amount + i.sgst_amount + i.igst_amount);
    });

    const rawGrandTotal = subtotal + totalTax;
    const grandTotal = Math.round(rawGrandTotal);
    const roundOff = grandTotal - rawGrandTotal;
    const safeNum = (n: number) => isNaN(n) ? 0 : n;

    return { 
      subtotal: safeNum(subtotal), 
      cgst: safeNum(cgst), 
      sgst: safeNum(sgst), 
      igst: safeNum(igst),
      totalTax: safeNum(totalTax), 
      grandTotal: safeNum(grandTotal), 
      roundOff: safeNum(roundOff),
      itemCount: cart.reduce((acc, i) => acc + i.quantity, 0),
      taxBreakup,
      processedItems: processed
    };
  }, [cart, activeOutlet, buyerState]);

  void legacyTotals;

  const canApplyManualDiscount = useMemo(() => {
    const role = String(currentUser?.role || '').toUpperCase();
    return ['OWNER', 'ADMIN', 'MANAGER'].includes(role) || (promotionConfig.allow_cashier_manual_discount && role === 'CASHIER');
  }, [currentUser?.role, promotionConfig.allow_cashier_manual_discount]);

  const handleAddCombo = (combo: ComboRule, selectedItems: Record<string, string[]>) => {
    const comboInstanceId = crypto.randomUUID();
    const missingChoiceGroup = combo.groups.find(group => group.mode === 'CHOICE' && (selectedItems[group.id] || []).length < group.required_quantity);
    if (missingChoiceGroup) {
      alert(`Select ${missingChoiceGroup.required_quantity} item(s) for ${missingChoiceGroup.label}.`);
      return;
    }

    combo.groups.forEach(group => {
      const itemIds = group.mode === 'FIXED' ? (group.fixed_items || []) : (selectedItems[group.id] || []);
      itemIds.slice(0, group.required_quantity || itemIds.length).forEach(itemId => {
        const menuItem = menuItems.find(item => item.id === itemId);
        if (!menuItem) return;
        addToCart(menuItem, [], {
          combo_id: combo.id,
          combo_instance_id: comboInstanceId,
          combo_group_id: group.id,
          combo_label: combo.name,
        });
      });
    });

    setPromotionModal(null);
  };

  const totals = useMemo(() => {
    const outletState = activeOutlet?.gst_state_code || activeOutlet?.state_code || '27';
    const destState = buyerState || outletState;
    const gstRegistered = activeOutlet?.gst_registered ?? false;

    return calculatePromotionPricing({
      cart: cart.map(item => ({
        line_id: item.line_id,
        item_id: item.id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_percentage: item.tax_percentage,
        //price_includes_tax: item.price_includes_tax,
        price_includes_tax: activeOutlet?.is_tax_inclusive ?? false,
        hsn_code: item.hsn_code,
        selected_modifiers: item.selected_modifiers,
        combo_id: item.combo_id,
        combo_instance_id: item.combo_instance_id,
        combo_group_id: item.combo_group_id,
        combo_label: item.combo_label,
      })),
      discounts: activeDiscounts,
      offers: activeOffers,
      combos: activeCombos,
      manualDiscount: canApplyManualDiscount ? manualDiscount : null,
      selectedOfferIds,
      outletState,
      destState,
      gstRegistered,
    });
  }, [cart, activeOutlet, buyerState, activeDiscounts, activeOffers, activeCombos, manualDiscount, selectedOfferIds, canApplyManualDiscount]);

  const runtimePrintPreferences = useMemo(() => {
    const browserAgentEnabled = localPrintAgent.available;
    const base = printerService.applyRuntimePrintRestrictions(printPreferences, {
      browserDirectPrintEnabled: browserAgentEnabled,
    });

    const supportsBrowserDirectRole = (printerIds: string[]) => {
      if (printCapabilities.platform !== 'BROWSER') return true;
      if (!browserAgentEnabled) return false;
      const printers = registeredPrinters.filter(printer => printer.id && printerIds.includes(printer.id));
      return printers.every(printer => ['LAN', 'USB', 'SYSTEM'].includes(printer.printer_type));
    };

    return {
      ...base,
      bill_auto_print: base.bill_auto_print && supportsBrowserDirectRole(base.bill_printer_ids),
      kot_auto_print: base.kot_auto_print && supportsBrowserDirectRole(base.kot_printer_ids),
    };
  }, [localPrintAgent.available, printCapabilities.platform, printPreferences, registeredPrinters]);

  const selectedBillPrinters = useMemo(
    () => registeredPrinters.filter(printer => printer.id && runtimePrintPreferences.bill_printer_ids.includes(printer.id)),
    [registeredPrinters, runtimePrintPreferences.bill_printer_ids]
  );

  const selectedKotPrinters = useMemo(
    () => registeredPrinters.filter(printer => printer.id && runtimePrintPreferences.kot_printer_ids.includes(printer.id)),
    [registeredPrinters, runtimePrintPreferences.kot_printer_ids]
  );

  const resolvePrinterTargets = (printers: RegisteredPrinter[]) => printers
    .map(printer => {
      const matchedSystemPrinter = systemPrinters.find(systemPrinter =>
        systemPrinter.name === printer.connection_hint ||
        systemPrinter.name === printer.name ||
        systemPrinter.technical_id === printer.connection_hint
      );

      if (matchedSystemPrinter?.name) return matchedSystemPrinter.name;
      if (printer.printer_type === 'SYSTEM') return printer.connection_hint || printer.name;
      return printer.name || printer.connection_hint || '';
    })
    .filter(Boolean);

  const resolvePaperSize = (role: 'bill' | 'kot') => {
    if (role === 'bill') return runtimePrintPreferences.bill_paper_size || '80mm';
    return runtimePrintPreferences.kot_paper_size || '80mm';
  };

  const availableBillPaperSizes = useMemo(() => {
    const selectedNames = new Set(resolvePrinterTargets(selectedBillPrinters));
    const sizes = systemPrinters
      .filter(printer => selectedNames.size === 0 || selectedNames.has(printer.name))
      .flatMap(printer => printer.paper_sizes || []);
    const uniqueSizes = [...new Set(sizes.filter(Boolean))];
    return uniqueSizes.length ? uniqueSizes : ['A4', 'A3', '58mm', '80mm', '85mm'];
  }, [systemPrinters, selectedBillPrinters]);

  useEffect(() => {
    const checkPrinter = async () => {
      const status = await printerService.checkAvailability(resolvePrinterTargets(selectedBillPrinters)[0]);
      setPrinterStatus(status);
    };
    checkPrinter();
  }, [selectedBillPrinters, activeOutlet?.id]);

  // Race-condition safety: Ensure invoice is rendered before allowing print
  useEffect(() => {
    if (showPrintPreview) {
      setPrintReady(false);
      // Wait for DOM to settle
      requestAnimationFrame(() => {
        setTimeout(() => {
          setPrintReady(true);
        }, 500);
      });
    }
  }, [showPrintPreview, lastInvoice]);

  const handlePrint = async (invoiceToPrint = lastInvoice, silent = false) => {
   
    if (!invoiceToPrint) return;
   if (invoiceToPrint === lastInvoice && showPrintPreview && !printReady) return;

    const targets = selectedBillPrinters.length
      ? selectedBillPrinters.map(printer => ({
          printerName: resolvePrinterTargets([printer])[0],
          printer,
        }))
      : [{ printerName: undefined, printer: null }];

    for (const target of targets) {
     {/* console.log(lastInvoice)  */}
      const result = await printerService.printInvoice(lastInvoice, { 
        paperSize: resolvePaperSize('bill'),
        silent,
        printerName: target.printerName,
        printer: target.printer,
      });

      if (result.success) {
        console.log(`Print Success: ${result.method} ${target.printerName || '[default]'}`);
      } else {
        alert(`Print Failed${target.printerName ? ` (${target.printerName})` : ''}: ${result.error}`);
        break;
      }
    }
  };

  const handleKotPrint = async (ticketPayload: any) => {
    console.log("Printing KOT with payload:", ticketPayload);
    const targets = selectedKotPrinters.length
      ? selectedKotPrinters.map(printer => ({
          printerName: resolvePrinterTargets([printer])[0],
          printer,
        }))
      : [{ printerName: undefined, printer: null }];

    for (const target of targets) {
      const result = await printerService.printKOT(ticketPayload, {
        paperSize: resolvePaperSize('kot'),
        silent: runtimePrintPreferences.kot_auto_print,
        printerName: target.printerName,
        printer: target.printer,
      });

      if (!result.success) {
        alert(`KOT Print Failed${target.printerName ? ` (${target.printerName})` : ''}: ${result.error}`);
        break;
      }
    }
  };

  const handleFinalizeAndPrint = async () => {
    if (!activeOutlet || !currentUser) return alert("System state mismatch.");
    if (orderType === 'DINE_IN' && !selectedTable) return alert("Select a table.");
    if (cart.length === 0) return alert("Cart is empty.");
    if (!validateCompliance()) return;

    setIsProcessing(true);
    try {
      const ctx = { company_id: currentUser.company_id, outlet_id: activeOutlet.id, staff_user_id: currentUser.id };
      const invNo = `INV-${activeOutlet.short_code || 'POS'}-${Date.now()}`;
      const invDate = new Date().toISOString();
      const qrPayload = activeOutlet.gst_registered ? `${activeOutlet.gst_number}|${invNo}|${invDate.split('T')[0]}|${totals.grandTotal}|${totals.totalTax.toFixed(2)}|${buyerGstin || 'NA'}` : null;
      
      const orderData = { 
        tableId: selectedTable?.name || orderType, 
        orderType: orderType, 
        items: totals.processedItems, 
        subtotal: totals.subtotal, 
        cgst: totals.cgst, 
        sgst: totals.sgst, 
        total: totals.grandTotal, 
        discount_total: totals.discountTotal,
        savings_total: totals.savingsTotal,
        promotion_snapshot: totals.appliedPromotions,
        status: 'completed' as const, 
        timestamp: new Date() 
      };

      const order = await db.createSyncableRecord(db.orders, orderData, ctx);
      
      const invoiceData: Invoice = { 
        id: crypto.randomUUID(),
        company_id: currentUser.company_id,
        outlet_id: activeOutlet.id,
        invoice_number: invNo, 
        invoice_date: invDate, 
        order_id: order.id, 
        seller_gstin: activeOutlet.gst_number || 'UNREGISTERED', 
        seller_legal_name: org.name, 
        seller_trade_name: activeOutlet.name, 
        seller_state_code: activeOutlet.gst_state_code || activeOutlet.state_code || '27', 
        buyer_name: buyerName || 'Counter Customer', 
        buyer_gstin: buyerGstin || "", 
        buyer_state_code: buyerState, 
        place_of_supply: buyerState, 
        invoice_type: buyerGstin ? 'B2B' : 'B2C', 
        billing_state_code: buyerState,
        outlet_state_code: activeOutlet.gst_state_code || activeOutlet.state_code || '27',
        taxable_value: totals.subtotal, 
        subtotal: totals.subtotal,
        cgst_total: totals.cgst, 
        sgst_total: totals.sgst, 
        igst_total: totals.igst, 
        total_tax: totals.totalTax, 
        round_off: totals.roundOff, 
        grand_total: totals.grandTotal, 
        discount_total: totals.discountTotal,
        savings_total: totals.savingsTotal,
        promotion_summary: totals.appliedPromotions,
        payment_method: selectedMop?.name || 'Cash', 
        payment_mode_id: selectedMop?.id,
        payment_mode_name: selectedMop?.name,
        finalized_by_user_id: currentUser.id,
        finalized_at: invDate,
        qr_payload: qrPayload || undefined, 
        irp_status: 'NOT_GENERATED'
      };

      const invoice = await db.createSyncableRecord(db.invoices, invoiceData, ctx);
      
      // SAVE INVOICE ITEMS TO DEXIE for cloud sync and local reporting
      const invoiceItemRows = totals.processedItems.map(item => ({
        id: crypto.randomUUID(),
        invoice_id: invoice.id,
        menu_item_id: item.id,
        name: item.name,
        quantity: item.quantity,
        selected_modifiers: item.selected_modifiers,
        taxable_value: item.taxable_value,
        cgst_amount: item.cgst_amount,
        sgst_amount: item.sgst_amount,
        igst_amount: item.igst_amount,
        total_amount: item.total_amount,
        discount_amount: item.discount_amount || 0,
        applied_promotions: item.applied_promotions || [],
        company_id: currentUser.company_id,
        outlet_id: activeOutlet.id,
        sync_status: 'pending',
        created_at: new Date()
      }));

      await db.invoice_items.bulkPut(invoiceItemRows);



      // FIX START: INV-C-01 Automated Recipe Depletion
      // Trigger background depletion to avoid blocking UI
      depleteInventoryForOrder(totals.processedItems, activeOutlet.id, order.id);
      // FIX END
      const preparedInvoice = { ...invoice, items: totals.processedItems, taxBreakup: totals.taxBreakup };
      

      
      const kotItems = cart.map(i => ({
        name: i.name,
        quantity: i.quantity,
        notes: '',
        selected_modifiers: i.selected_modifiers,
      }));
      const kotPayload = {
        order_id: order.id,
        outlet_name: activeOutlet.name,
        table_name: orderData.tableId,
        created_at: invDate,
        staff_name: currentUser.full_name || currentUser.name || 'Counter',
        items: kotItems,
      };

      setLastInvoice(preparedInvoice);
      setPaperWidth(runtimePrintPreferences.bill_paper_size || '80mm');
      setShowPrintPreview(!runtimePrintPreferences.bill_auto_print);

      if (runtimePrintPreferences.bill_auto_print) {
        await handlePrint(preparedInvoice, true);
      }

      if (isOnline) {
        await kitchenService.createTicket({ 
          order_id: order.id, 
          outlet_id: activeOutlet.id, 
          table_name: orderData.tableId, 
          items: kotItems,
        });
      }
       
      //if (runtimePrintPreferences.kot_auto_print && kotItems.length > 0) {
        await handleKotPrint(kotPayload);
      //}

      setCart([]);
      setSelectedTable(null);
      setBuyerGstin('');
      setBuyerName('');
      setIsCartOpen(false);
      
    } catch (e: any) {
      alert(`Finalization failed: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const depleteInventoryForOrder = async (items: any[], outletId: string, orderId: string) => {
    try {
      for (const item of items) {
        const recipe = await recipeService.getFinalizedRecipeByItemName(item.name, outletId);
        if (recipe && recipe.recipe_json?.ingredients) {
          for (const ing of recipe.recipe_json.ingredients) {
            // Deduct from inventory: quantity * recipe_quantity
            const totalDeduction = item.quantity * ing.quantity;
            const targetId = (ing as any).inventory_id || ing.name;
            await inventoryService.deductStock(
              targetId, 
              outletId, 
              totalDeduction, 
              `SALE: ${item.name}`,
              { type: 'POS_SALE', id: orderId }
            );
          }
        }
      }
    } catch (e) {
      console.error("[INVENTORY_DEPLETION] Failed to deplete stock:", e);
    }
  };

  const getMopIcon = (type: string) => {
    switch (type) {
      case 'CASH': return <Banknote size={16} />;
      case 'CARD': return <CreditCard size={16} />;
      case 'DIGITAL': return <Wallet size={16} />;
      default: return <Receipt size={16} />;
    }
  };

  const filteredItems = menuItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (selectedCategory === 'All' || item.category === selectedCategory)
  );
  const desktopCategoryList = useMemo(() => ['All', ...categories.map((c) => c.name)], [categories]);

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-50 print:p-0 print:bg-white ">

      <div className="flex  h-full w-full no-print ">



          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">

     

               <div className="flex min-h-0 flex-1  flex-row overflow-hidden">
            

                        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
             
             
                    <div className="flex-1 overflow-auto p-3 sm:p-6">
                        
                         {/* Order Type & menu Search Bar */}
        
                        <div className="flex flex-col gap-4">
          <div className="flex bg-slate-100 p-1.5 rounded-3xl border shadow-inner shrink-0 lg:hidden">
             {['DINE_IN', 'TAKEAWAY', 'DELIVERY'].map(type => (
               <button key={type} onClick={() => setOrderType(type as OrderType)} className={`px-5 py-3 lg:px-7 lg:py-4 rounded-2xl text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all touch-manipulation ${orderType === type ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{type.replace('_', '-')}</button>
             ))}
          </div>
          {orderType === 'DINE_IN' && (
            <button onClick={() => setShowTableSelector(true)} className={`flex items-center gap-3 px-6 py-3 lg:px-7 lg:py-4 rounded-3xl border-2 transition-all shrink-0 touch-manipulation ${selectedTable ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-400'}`}>
              <Utensils size={18} /><span className="text-[10px] lg:text-[11px] font-black uppercase tracking-widest">{selectedTable ? `Table ${selectedTable.name}` : 'Select Table'}</span>
            </button>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Quick search menu..." className="w-full pl-12 pr-12 py-3 lg:py-4 rounded-3xl border border-slate-200 focus:ring-2 focus:ring-orange-500 outline-none text-sm lg:text-base font-bold shadow-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <button 
              onClick={isListening ? stopListening : startListening}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${
                isListening ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'
              }`}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          </div>
         {/*} <select
            value={paperWidth}
            onChange={(e) => setPaperWidth(e.target.value)}
            className="bg-indigo-50 px-4 py-3 rounded-3xl border border-indigo-100 text-[10px] font-black uppercase tracking-widest text-indigo-600 outline-none lg:hidden"
          >
            {availableBillPaperSizes.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select> */}
          <button 
            onClick={toggleFullscreen}
            className="p-3 lg:p-4 bg-slate-100 text-slate-400 rounded-3xl hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-sm touch-manipulation lg:hidden"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
                        </div>
 <div className="lg:hidden  flex gap-3 overflow-x-auto pb-1 scrollbar-hide ">
          {['All', ...categories.map(c => c.name)].map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)} className={`shrink-0 px-4 py-2 sm:px-6 sm:py-3 lg:px-7 lg:py-4 rounded-full whitespace-nowrap font-black text-[10px] lg:text-[11px] uppercase transition-all border-2 touch-manipulation ${selectedCategory === cat ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}>{cat}</button>
          ))}
        </div>

        <div className="hidden items-center gap-3 overflow-x-auto pt-1 scrollbar-hide">
          <button onClick={() => setShowPaymentPicker(true)} className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-3 text-left shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50">
            <CreditCard size={18} className="text-indigo-600" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">Payment: {selectedMop?.name || 'Select Mode'}</span>
          </button>
          <button onClick={() => setSelectedCategory('All')} className="rounded-3xl border border-slate-200 bg-white px-5 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition-all hover:border-orange-300 hover:bg-orange-50">
            Reset Filter
          </button>
          <button onClick={() => setSearchQuery('')} className="rounded-3xl border border-slate-200 bg-white px-5 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50">
            Clear Search
          </button>
          {orderType === 'DINE_IN' && (
            <button onClick={() => setShowTableSelector(true)} className="rounded-3xl border border-slate-200 bg-white px-5 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50">
              {selectedTable ? `Table ${selectedTable.name}` : 'Pick Table'}
            </button>
          )}
        </div>
      


                        <div className="flex flex-row gap-4 mt-4 ">

                        {/* desktop category sidebar */ }

 
                      <div className= "max-md:hidden flex flex-col   border-t xl:border-l  xl:border-r xl:border-t-0 border-slate-300 bg-white ">

         
            {desktopCategoryList.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-3 text-left text-sm font-bold border-b border-slate-100 transition-colors ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block truncate">{cat}</span>
                </button>
              );
            })}
                        </div> 
                      
                         {/* menu name grid */}
                                

                          <div className="grid  grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-2">
                          
                           {priceError && <div className="mb-6 bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-600 animate-in fade-in slide-in-from-top-4"><AlertCircle size={20} /><p className="font-bold text-sm">{priceError}</p></div>}
                           {filteredItems.map(item => (
                           <button key={item.id} onClick={() => addToCart(item)} 
                                 className=" flex flex-col group overflow-hidden rounded-3xl bg-white text-left shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl active:scale-[0.98] border border-slate-200 hover:border-orange-500 cursor-pointer">

              
                              <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                               <img
                                src={item.image || item.image_url}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                               />

                                <div className="absolute top-2 right-2 bg-white/95 px-2 py-1 rounded-xl text-[10px] sm:text-[10px] font-black text-orange-600 shadow-xl border border-white/50">₹{item.base_price ?? item.price}</div>
                                </div>
                                <div className="p-4 lg:p-4">
                                   <h4 className="font-black text-sm lg:text-[15px] lg:leading-8 text-slate-800 leading-tight h-10 lg:h-16 line-clamp-2">{item.name}</h4>
                                   <div className="flex items-center justify-between mt-4 lg:mt-2">
                                       <p className="text-[9px] lg:text-xs text-slate-400 font-black uppercase tracking-tighter">{item.menu_categories?.name || item.category}</p>
                                      <div className="p-2.5 bg-slate-50 text-slate-300 rounded-xl group-hover:bg-orange-50 group-hover:text-orange-500 transition-colors"><Plus size={16} /></div>
                                    </div>
                              </div>
                            </button>
                           ))}
        
                          </div>
                        

                    </div>
                    
                  </div>

                        </section>




          

                              {/* pos cart */}

                         <aside className="  max-md:hidden flex lg:w-[420px] xl:w-[420px] flex-col border-t xl:border-l xl:border-t-0 border-slate-200 bg-white">
                          
                                  <div className="border-b border-slate-200 p-2">
                                 
                                  <div className="grid grid-cols-3 bg-slate-800 text-white text-center">
                  {[
                    { key: 'DINE_IN', label: 'DINE IN' },
                    { key: 'DELIVERY', label: 'DELIVERY' },
                    { key: 'TAKEAWAY', label: 'PICK UP' }
                  ].map(mode => (
                    <button
                      key={mode.key}
                      onClick={() => setOrderType(mode.key as OrderType)}
                      className={`py-4 font-black text-sm border-r border-slate-700 last:border-r-0 ${orderType === mode.key ? 'bg-orange-500 text-white' : 'text-slate-200 hover:bg-slate-700'}`}
                    >
                      {mode.label}
                    </button>
                  ))}
                                 </div>
                                 
                                  </div>

              {/*<div className="p-2 border-b flex justify-between items-center shrink-0"> */}
              
                               <div className="grid grid-cols-2">

                                  <div className="flex items-center gap-4">

                                     <div className="w-3 h-3 bg-orange-500 rounded-[24px] flex items-center justify-center text-white shadow-xl"><ShoppingBag size={30} /></div>
                                     <div><h1 className="text-1xl font-black text-slate-900 tracking-tight leading-none">Checkout</h1><p className="text-[10px] font-black uppercase text-slate-400  mt-1.5">{orderType} • {selectedTable?.name || 'Quick Sale'}</p></div>
                
                
                
                                 </div>
                

            <div className="   flex flex-1   w-full   py-4 bg-slate-50   justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                    {getMopIcon(selectedMop?.type || 'CASH')}
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400 leading-none mb-1">Pay Via</p>
                    <p className="font-black text-slate-900 text-sm leading-none">{selectedMop?.name || 'Select Mode'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowPaymentPicker(true)}
                  className="mr-0 px-4 py-2 bg-white border border-slate-200 rounded-xl font-black text-[9px] uppercase tracking-widest text-indigo-600 shadow-sm hover:bg-indigo-50 transition-all"
                >
                  Change
                </button>
              </div>
             
              </div>
            
            
             




         {/*
              <div className="px-8 py-6 bg-white border-b space-y-4">
                <div className="flex items-center gap-2 mb-2"><User size={16} className="text-indigo-600" /><span className="text-[10px] font-black uppercase tracking-widest text-slate-800">Compliance Metadata (B2B)</span></div>
                <div className="grid grid-cols-1 gap-3">
                  <input placeholder="Buyer GSTIN (Optional)" className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold uppercase outline-none focus:ring-1 focus:ring-indigo-500" value={buyerGstin} onChange={e => setBuyerGstin(e.target.value.toUpperCase())} />
                  {buyerGstin && <input placeholder="Buyer Legal Name" className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-500" value={buyerName} onChange={e => setBuyerName(e.target.value)} />}
                </div>
              </div>
              */}

 <div className={`px-6 pt-4 sm:px-8 shrink-0 ${totals.savingsTotal <= 0 ? 'hidden' : ''}`}>
                <PromotionActionBar
                  savingsTotal={totals.savingsTotal}
                  appliedCount={totals.appliedPromotions.length}
                  onOpen={mode => setPromotionModal(mode)}
                />
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto  p8 space-y-6 scrollbar-hide">
                {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30"><Utensils size={64} className="text-slate-300" /><p className="font-black text-xs uppercase tracking-widest">Cart is Empty</p></div> : cart.map((item) => (
                  
                  
                  
                  <div key={item.line_id} className="flex justify-between items-start animate-in slide-in-from-right-4 duration-300">
                   
                   <div> <button
                        onClick={() => updateQuantity(item.id, -item.quantity, item.selected_modifiers, item.line_id)}
                        className=" bg-red-50  text-xs font-black uppercase  text-red-600 transition-all hover:bg-red-100"
                      >
                        X
                      </button>  </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <h5 className="font-black text-sm text-slate-800 truncate">{item.name}</h5>
                      {item.combo_label && <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mt-1">{item.combo_label}</p>}
                      {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mt-1">
                          + {item.selected_modifiers.map(m => m.name).join(', ')}
                        </p>
                      )}
                      <p className="text-[10px] font-black text-slate-400 uppercase mt-1">
                        Rs. {item.unit_price + (item.selected_modifiers || []).reduce((s, m) => s + m.price, 0)} @ {item.tax_percentage}% GST 
                        {activeOutlet?.is_tax_inclusive ? <span className="ml-1 text-emerald-600">(Incl)</span> : <span className="ml-1 text-orange-600">(Excl)</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="flex items-center bg-slate-100 rounded-3xl p-1.5 shadow-inner">
                        <button onClick={() => updateQuantity(item.id, -1, item.selected_modifiers, item.line_id)} className="p-3 hover:bg-white rounded-2xl transition-all touch-manipulation"><Minus size={16} /></button>
                        <span className="w-12 text-center font-black text-base">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1, item.selected_modifiers, item.line_id)} className="p-3 hover:bg-white rounded-2xl transition-all touch-manipulation"><Plus size={16} /></button>
                      </div>
                      <div className="w-24 text-right">
                        <span className="font-black text-sm text-slate-900">Rs. {Number((totals.linePricing[item.line_id]?.final_amount ?? item.total_price) || 0).toFixed(0)}</span>
                        {(totals.linePricing[item.line_id]?.line_discount || 0) + (totals.linePricing[item.line_id]?.order_discount_share || 0) > 0 && (
                          <p className="text-[10px] font-black text-emerald-600 mt-1">-₹{((totals.linePricing[item.line_id]?.line_discount || 0) + (totals.linePricing[item.line_id]?.order_discount_share || 0)).toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
               {/* TAX BREAKUP (CRITICAL)  big screen*/}
              <div className="p-1 sm:p-5 bg-slate-900 text-white space-y-1 border-t border-slate-700 shadow-2xl shrink-0 sticky bottom-0 left-0 right-0 z-20">
                {/*
                <div className="space-y-2">
                  
                  
                 
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500"><span>Taxable Value</span><span className="text-slate-300">Rs. {totals.subtotal.toFixed(2)}</span></div>
                  {totals.discountTotal > 0 && <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-emerald-400"><span>Discount</span><span>- Rs. {totals.discountTotal.toFixed(2)}</span></div>}
                  
                  {activeOutlet?.gst_registered && Object.entries(totals.taxBreakup).map(([rate, vals]: [string, any]) => (
                    <div key={rate} className="space-y-1">
                      {vals.igst > 0 ? (
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 italic">
                          <span>IGST @ {rate}%</span><span className="text-slate-300">Rs. {vals.igst.toFixed(2)}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 italic">
                            <span>CGST @ {Number(rate)/2}%</span><span className="text-slate-300">Rs. {vals.cgst.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 italic">
                            <span>SGST @ {Number(rate)/2}%</span><span className="text-slate-300">Rs. {vals.sgst.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {activeOutlet?.gst_registered && <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 pt-2 border-t border-white/5"><span>Total Tax</span><span className="text-slate-300">Rs. {totals.totalTax.toFixed(2)}</span></div>}
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500"><span>Round-off</span><span className={totals.roundOff < 0 ? 'text-rose-400' : 'text-emerald-400'}>Rs. {totals.roundOff.toFixed(2)}</span></div>
                
                  </div>
                  */}
                                    <div className={`flex items-left gap-0 px-1 py-1 rounded-lg border ${isOnline ? 'border-emerald-500/20 text-emerald-500' : 'border-rose-500/20 text-rose-500'}`}>{isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}<span className="text-[9px] font-black uppercase">{isOnline ? 'Sync' : 'Local'}</span></div>

                <div className="flex justify-between items-end pt-4 border-t border-white/10">

                   <div><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Grand Payable</p><span className="font-black text-3xl text-orange-500 tracking-tighter">Rs. {totals.grandTotal}</span></div>
                  <div className="flex flex-col items-end gap-2">
                   {/* {printerStatus && (
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${printerStatus.available ? 'border-indigo-500/20 text-indigo-400' : 'border-rose-500/20 text-rose-400'}`}>
                        <Printer size={14} />
                        <span className="text-[9px] font-black uppercase">{printerStatus.available ? printerStatus.name : 'Offline'}</span>
                      </div>
                    )} 
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${directPrintAvailable ? 'border-emerald-500/20 text-emerald-500' : 'border-amber-500/20 text-amber-500'}`}>
                      <span className="text-[9px] font-black uppercase">{printCapabilities.platform} {directPrintAvailable ? 'Direct' : 'Dialog'}</span>
                    </div> 
                    */}
                  </div>
                </div>
                
                <button 
                  onClick={handleFinalizeAndPrint} 
                  disabled={cart.length === 0 || isProcessing || !selectedMop} 
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-emerald-900/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale touch-manipulation"
                >
                  {isProcessing ? <Loader2 className="animate-spin" size={24} /> : (
                    <>
                      <div className="p-2 bg-white/20 rounded-xl">
                        <Printer size={20} />
                      </div>
                      {directPrintAvailable ? `FINALIZE & PRINT (Rs. ${totals.grandTotal})` : `FINALIZE & PREVIEW (Rs. ${totals.grandTotal})`}
                    </>
                  )}
                </button>
              </div>
                         </aside>
      





                </div>

 {/*   
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide lg:hidden">
          {['All', ...categories.map(c => c.name)].map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-2 sm:px-6 sm:py-3 lg:px-7 lg:py-4 rounded-full whitespace-nowrap font-black text-[10px] lg:text-[11px] uppercase transition-all border-2 touch-manipulation ${selectedCategory === cat ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}>{cat}</button>
          ))}
        </div>
      } <div className="hidden items-center gap-3 overflow-x-auto pt-1 scrollbar-hide">
          <button onClick={() => setShowPaymentPicker(true)} className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-3 text-left shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50">
            <CreditCard size={18} className="text-indigo-600" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">Payment: {selectedMop?.name || 'Select Mode'}</span>
          </button>
          <button onClick={() => setSelectedCategory('All')} className="rounded-3xl border border-slate-200 bg-white px-5 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition-all hover:border-orange-300 hover:bg-orange-50">
            Reset Filter
          </button>
          <button onClick={() => setSearchQuery('')} className="rounded-3xl border border-slate-200 bg-white px-5 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50">
            Clear Search
          </button>
          {orderType === 'DINE_IN' && (
            <button onClick={() => setShowTableSelector(true)} className="rounded-3xl border border-slate-200 bg-white px-5 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50">
              {selectedTable ? `Table ${selectedTable.name}` : 'Pick Table'}
            </button>
          )}
        </div> 
        
        
        */}







        </main>
      
      
      
      
      </div>

      {/* AI Voice Assistant Overlay */}
      {/*
      <AnimatePresence>
        {aiStatus && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-4 pointer-events-none"
          >
            <div className={`bg-white rounded-[2rem] shadow-2xl border-2 p-4 flex items-center gap-4 pointer-events-auto transition-colors duration-300 ${
              aiStatus.type === 'success' ? 'border-emerald-500' :
              aiStatus.type === 'error' ? 'border-rose-500' :
              aiStatus.type === 'warning' ? 'border-amber-500' :
              'border-indigo-500'
            }`}>
              <div className={`p-3 rounded-2xl transition-colors duration-300 ${
                currentVoiceState === 'PROCESSING' ? 'bg-orange-50' :
                currentVoiceState === 'SPEAKING' ? 'bg-emerald-50' :
                currentVoiceState === 'LISTENING' ? 'bg-indigo-50' :
                currentVoiceState === 'EXECUTING' ? 'bg-emerald-100' :
                currentVoiceState === 'WAITING_FOR_CONFIRMATION' ? 'bg-amber-50' :
                'bg-slate-50'
              }`}>
                {currentVoiceState === 'LISTENING' ? (
                  <div className="relative">
                    <Mic className="text-indigo-600 animate-pulse" size={24} />
                    <motion.div
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="absolute inset-0 bg-indigo-400/20 rounded-full"
                    />
                  </div>
                ) : currentVoiceState === 'PROCESSING' ? (
                  <Loader2 className="text-orange-600 animate-spin" size={24} />
                ) : currentVoiceState === 'SPEAKING' ? (
                  <Sparkles className="text-emerald-600 animate-bounce" size={24} />
                ) : currentVoiceState === 'EXECUTING' ? (
                  <Check className="text-emerald-600" size={24} />
                ) : currentVoiceState === 'WAITING_FOR_CONFIRMATION' ? (
                  <Info className="text-amber-600 animate-pulse" size={24} />
                ) : (
                  <MicOff className="text-slate-400" size={24} />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">PapaPOS Assistant</p>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter ${
                    currentVoiceState === 'LISTENING' ? 'bg-indigo-100 text-indigo-600' :
                    currentVoiceState === 'PROCESSING' ? 'bg-orange-100 text-orange-600' :
                    currentVoiceState === 'SPEAKING' ? 'bg-emerald-100 text-emerald-600' :
                    currentVoiceState === 'EXECUTING' ? 'bg-emerald-200 text-emerald-800' :
                    currentVoiceState === 'WAITING_FOR_CONFIRMATION' ? 'bg-amber-100 text-amber-600' :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {currentVoiceState.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {currentVoiceState === 'WAITING_FOR_CONFIRMATION' ? "Do you need anything else?" : aiStatus?.message}
                </p>
              </div>
              {currentVoiceState === 'LISTENING' && (
                <div className="flex gap-1">
                  {[1, 2, 3].map(i => (
                    <motion.div
                      key={i}
                      animate={{ height: [4, 12, 4] }}
                      transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                      className="w-1 bg-indigo-400 rounded-full"
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      */}

      
      {/* mobile pos */}

      {/* Floating CTA */}
      <button onClick={() => setIsCartOpen(true)} className={`fixed bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-4 bg-slate-900 text-white pl-6 pr-4 py-3 sm:py-4 rounded-[32px] shadow-2xl hover:scale-105 active:scale-95 transition-all group no-print lg:hidden ${cart.length === 0 ? 'translate-y-32' : ''}`}>
        <div className="flex flex-col items-start leading-none"><span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{totals.itemCount} Items</span><span className="text-xl font-black text-orange-500">₹{totals.grandTotal}</span></div>
        <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:bg-orange-400 transition-colors"><ShoppingCart size={20} /></div>
      </button>




      {/* Sidebar Cart */}
      <div className={`fixed inset-y-0 right-0 z-[1000] w-full md:w-[420px] bg-white shadow-[0_0_80px_rgba(0,0,0,0.15)] flex flex-col transition-transform duration-500 ease-in-out no-print lg:hidden ${isCartOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-8 border-b flex justify-between items-center shrink-0">
           <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-orange-500 rounded-[22px] flex items-center justify-center text-white shadow-xl"><ShoppingBag size={28} /></div>
              <div><h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Checkout</h3><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1.5">{orderType} • {selectedTable?.name || 'Quick Sale'}</p></div>
           </div>
           <button onClick={() => setIsCartOpen(false)} className="p-4 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-all"><ChevronRight size={24} /></button>
        </div>

        {/* PAYMENT MODE BAR (CRITICAL) */}
        <div className="px-8 py-4 bg-slate-50 border-b flex items-center justify-between">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                 {getMopIcon(selectedMop?.type || 'CASH')}
              </div>
              <div>
                 <p className="text-[9px] font-black uppercase text-slate-400 leading-none mb-1">Pay Via</p>
                 <p className="font-black text-slate-900 text-sm leading-none">{selectedMop?.name || 'Select Mode'}</p>
              </div>
           </div>
           <button 
             onClick={() => setShowPaymentPicker(true)}
             className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-black text-[9px] uppercase tracking-widest text-indigo-600 shadow-sm hover:bg-indigo-50 transition-all"
           >
              Change
           </button>
        </div>
{/*
        <div className="px-8 py-6 bg-white border-b space-y-4">
           <div className="flex items-center gap-2 mb-2"><User size={16} className="text-indigo-600" /><span className="text-[10px] font-black uppercase tracking-widest text-slate-800">Compliance Metadata (B2B)</span></div>
           <div className="grid grid-cols-1 gap-3">
              <input placeholder="Buyer GSTIN (Optional)" className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold uppercase outline-none focus:ring-1 focus:ring-indigo-500" value={buyerGstin} onChange={e => setBuyerGstin(e.target.value.toUpperCase())} />
              {buyerGstin && <input placeholder="Buyer Legal Name" className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-500" value={buyerName} onChange={e => setBuyerName(e.target.value)} />}
           </div>
        </div>
*/}
        <div className="px-8 pt-4 shrink-0">
           <PromotionActionBar
             savingsTotal={totals.savingsTotal}
             appliedCount={totals.appliedPromotions.length}
             onOpen={mode => setPromotionModal(mode)}
           />
        </div>
        <div className="flex-1 overflow-y-auto p-8 space-y-1 scrollbar-hide pb-56">
           {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-center space-y-2 opacity-30"><Utensils size={60} className="text-slate-300" /><p className="font-black text-xs uppercase tracking-widest">Cart is Empty</p></div> : cart.map((item) => (
             <div key={item.line_id} className="flex justify-between items-start animate-in slide-in-from-right-4 duration-300">
                <div className="flex-1 min-w-0 pr-4">
                   <h6 className="font-black text-sm text-slate-800 truncate">{item.name}</h6>
                   {item.combo_label && <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mt-1">{item.combo_label}</p>}
                   {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                     <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mt-1">
                       + {item.selected_modifiers.map(m => m.name).join(', ')}
                     </p>
                   )}
                   <p className="text-[10px] font-black text-slate-400 uppercase mt-1">
                      ₹{item.unit_price + (item.selected_modifiers || []).reduce((s, m) => s + m.price, 0)} @ {item.tax_percentage}% GST 
                      {activeOutlet?.is_tax_inclusive? <span className="ml-1 text-emerald-600">(Incl)</span> : <span className="ml-1 text-orange-600">(Excl)</span>}
                   </p>
                </div>
                <div className="flex items-center gap-2">
                   <div className="flex items-center bg-slate-100 rounded-2xl p-1 shadow-inner">
                     <button onClick={() => updateQuantity(item.id, -1, item.selected_modifiers, item.line_id)} className="p-2 hover:bg-white rounded-xl transition-all"><Minus size={14} /></button>
                     <span className="w-10 text-center font-black text-sm">{item.quantity}</span>
                     <button onClick={() => updateQuantity(item.id, 1, item.selected_modifiers, item.line_id)} className="p-2 hover:bg-white rounded-xl transition-all"><Plus size={14} /></button>
                   </div>
                   <div className="w-20 text-right"><span className="font-black text-sm text-slate-900">₹{Number((totals.linePricing[item.line_id]?.final_amount ?? item.total_price) || 0).toFixed(0)}</span></div>
                </div>
             </div>
           ))}
        </div>
        <div className="p-6 sm:p-8 bg-slate-900 text-white space-y-6 rounded-t-[28px] shadow-2xl shrink-0 sticky bottom-0 left-0 right-0 z-30">
           <div className="space-y-4">
           {/* TAX BREAKUP (CRITICAL) */}

            {/*
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500"><span>Taxable Value</span><span className="text-slate-300">₹{totals.subtotal.toFixed(2)}</span></div>
              {totals.discountTotal > 0 && <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-emerald-400"><span>Discount</span><span>- ₹{totals.discountTotal.toFixed(2)}</span></div>}
              
              {activeOutlet?.gst_registered && Object.entries(totals.taxBreakup).map(([rate, vals]: [string, any]) => (
                 <div key={rate} className="space-y-1">
                    {vals.igst > 0 ? (
                       <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 italic">
                          <span>IGST @ {rate}%</span><span className="text-slate-300">₹{vals.igst.toFixed(2)}</span>
                       </div>
                    ) : (
                       <>
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 italic">
                             <span>CGST @ {Number(rate)/2}%</span><span className="text-slate-300">₹{vals.cgst.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 italic">
                             <span>SGST @ {Number(rate)/2}%</span><span className="text-slate-300">₹{vals.sgst.toFixed(2)}</span>
                          </div>
                       </>
                    )}
                 </div>
              ))}


              {activeOutlet?.gst_registered && <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 pt-2 border-t border-white/5"><span>Total Tax Aggregates</span><span className="text-slate-300">₹{totals.totalTax.toFixed(2)}</span></div>}
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500"><span>Round-off</span><span className={totals.roundOff < 0 ? 'text-rose-400' : 'text-emerald-400'}>₹{totals.roundOff.toFixed(2)}</span></div>
          */}
              </div>      
           <div className="flex justify-between items-end pt-8 border-t border-white/10">
              <div><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Grand Payable</p><span className="font-black text-5xl text-orange-500 tracking-tighter">₹{totals.grandTotal}</span></div>
              <div className="flex flex-col items-end gap-2">
                <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${isOnline ? 'border-emerald-500/20 text-emerald-500' : 'border-rose-500/20 text-rose-500'}`}>{isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}<span className="text-[9px] font-black uppercase">{isOnline ? 'Sync' : 'Local'}</span></div>
                {printerStatus && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${printerStatus.available ? 'border-indigo-500/20 text-indigo-400' : 'border-rose-500/20 text-rose-400'}`}>
                    <Printer size={14} />
                    <span className="text-[9px] font-black uppercase">{printerStatus.available ? printerStatus.name : 'Offline'}</span>
                  </div>
                )}
                <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${directPrintAvailable ? 'border-emerald-500/20 text-emerald-500' : 'border-amber-500/20 text-amber-500'}`}>
                  <span className="text-[9px] font-black uppercase">{printCapabilities.platform} {directPrintAvailable ? 'Direct' : 'Dialog'}</span>
                </div>
              </div>
           </div>
           
           <button 
             onClick={handleFinalizeAndPrint} 
             disabled={cart.length === 0 || isProcessing || !selectedMop} 
             className="w-full py-3 sm:py-4 bg-emerald-600 text-white rounded-[28px] font-black uppercase tracking-widest text-sm shadow-2xl shadow-emerald-900/40 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
           >
              {isProcessing ? <Loader2 className="animate-spin" size={24} /> : (
                <>
                  <div className="p-2 bg-white/20 rounded-xl">
                    <Printer size={20} />
                  </div>
                  {directPrintAvailable ? `FINALIZE & PRINT (Rs. ${totals.grandTotal})` : `FINALIZE & PREVIEW (Rs. ${totals.grandTotal})`}
                </>
              )}
           </button>
        </div>
      </div>

      {/* Modifier Modal */}
      {modifierItem && (
        <div className="pt-30 overflow-scroll fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md ">
            <div className=" bg-white rounded-[48px] w-full max-w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl shadow-2xl  animate-in zoom-in duration-300">
              <div className="overflow-scroll p-6 sm:p-10 bg-slate-900 text-white flex justify-between items-center">
                 <div>
                    <h3 className="text-2xl font-black tracking-tight uppercase">Customize Item</h3>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{modifierItem.name}</p>
                 </div>
                 <button onClick={() => setModifierItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={24} /></button>
              </div>
              <div className="p-6 sm:p-10 space-y-6">
                 <div className="space-y-4 ">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Available Modifiers</label>
                    <div className="grid grid-cols-1 gap-3 ">
                       {modifierItem.modifiers?.map((mod: Modifier) => (
                         <button 
                           key={mod.id}
                           onClick={() => toggleModifier(mod)}
                           className={`flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${
                             tempSelectedModifiers.find(m => m.id === mod.id)
                               ? 'border-orange-500 bg-orange-50'
                               : 'border-slate-100 bg-white hover:border-slate-200'
                           }`}
                         >
                            <div className="flex items-center gap-4">
                               <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                 tempSelectedModifiers.find(m => m.id === mod.id)
                                   ? 'bg-orange-500 border-orange-500 text-white'
                                   : 'border-slate-200'
                               }`}>
                                  {tempSelectedModifiers.find(m => m.id === mod.id) && <Check size={14} />}
                               </div>
                               <span className="font-black text-sm text-slate-800 uppercase">{mod.name}</span>
                            </div>
                            <span className="font-black text-xs text-slate-400">
                               {mod.price > 0 ? `+ ₹${mod.price}` : 'Free'}
                            </span>
                         </button>
                       ))}
                    </div>
                 </div>
                 <button 
                   onClick={() => addToCart(modifierItem, tempSelectedModifiers)}
                   className="w-full py-4 sm:py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-sm shadow-2xl"
                 >
                    Add to Order (₹{Number(modifierItem.base_price ?? modifierItem.price) + tempSelectedModifiers.reduce((s, m) => s + m.price, 0)})
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* PAYMENT MODE PICKER */}
      {showPaymentPicker && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md">
           <div className="bg-white rounded-[56px] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
              <div className="p-10 border-b bg-slate-50/50 flex justify-between items-center shrink-0">
                 <div><h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Payment Mode</h3><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Select settlement channel</p></div>
                 <button onClick={() => setShowPaymentPicker(false)} className="p-4 bg-white border border-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-all shadow-sm"><X size={28} /></button>
              </div>
              <div className="p-10 grid grid-cols-1 gap-4 overflow-y-auto max-h-[60vh]">
                 {paymentModes.map(mop => (
                   <button 
                     key={mop.id} 
                     onClick={() => { setSelectedMop(mop); setShowPaymentPicker(false); }} 
                     className={`flex items-center justify-between p-6 rounded-3xl border-2 transition-all ${selectedMop?.id === mop.id ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-white border-slate-100 hover:border-indigo-200'}`}
                   >
                      <div className="flex items-center gap-4">
                         <div className={`p-4 rounded-2xl ${selectedMop?.id === mop.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {getMopIcon(mop.type)}
                         </div>
                         <div className="text-left">
                            <p className="font-black text-slate-900">{mop.name}</p>
                            {mop.is_default && <span className="text-[8px] font-black uppercase text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded">Default Mode</span>}
                         </div>
                      </div>
                      {selectedMop?.id === mop.id && <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white"><Check size={18} /></div>}
                   </button>
                 ))}
              </div>
              <div className="p-10 border-t bg-slate-50/50 flex justify-end">
                 <button onClick={() => setShowPaymentPicker(false)} className="px-12 py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-xs">Dismiss</button>
              </div>
           </div>
        </div>
      )}

      {/* PRINT PREVIEW MODAL */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md">
           <div className="bg-white rounded-[56px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
              <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
                 <div>
                   <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Print Preview</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Verify invoice before physical print</p>
                 </div>
                 <div className="flex gap-2">
                    <select
                      value={paperWidth}
                      onChange={e => setPaperWidth(e.target.value)}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase shadow-sm outline-none"
                    >
                      {availableBillPaperSizes.map(size => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                    <button onClick={() => setShowPrintPreview(false)} className="p-3 bg-white border border-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-all shadow-sm"><X size={20} /></button>
                 </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex justify-center">
                 <div className={`bg-white shadow-lg p-6 ${String(paperWidth).includes('58') ? 'w-[220px]' : 'w-[300px]'} font-mono text-[10px] text-black`}>
                    {/* This mirrors the print-area content for visual preview */}
                    <div className="text-center mb-4">
                      <div className="font-bold text-sm uppercase">{org?.name}</div>
                      <div>{activeOutlet?.name}</div>
                      <div className="text-[8px]">{activeOutlet?.address}</div>
                      {activeOutlet?.gst_registered ? (
                        <div className="font-bold mt-1">GSTIN: {activeOutlet?.gst_number}</div>
                      ) : (
                        <div className="font-bold mt-1">NON-GST INVOICE</div>
                      )}
                    </div>
                    <div className="border-b border-dotted border-black my-2" />
                    <div className="space-y-0.5">
                      <div>INV: {lastInvoice?.invoice_number}</div>
                      <div>DATE: {new Date(lastInvoice?.invoice_date).toLocaleString()}</div>
                      <div>MODE: {lastInvoice?.payment_method}</div>
                    </div>
                    <div className="border-b border-dotted border-black my-2" />
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-black">
                          <th className="font-bold">ITEM</th>
                          <th className="text-right font-bold">QTY</th>
                          <th className="text-right font-bold">AMT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastInvoice?.items?.map((item: any, i: number) => (
                          <tr key={i}>
                            <td className="py-1">
                              {item.name}
                              {item.selected_modifiers?.length > 0 && (
                                <div className="text-[7px] italic text-slate-500">
                                  + {item.selected_modifiers.map((m: any) => m.name).join(', ')}
                                </div>
                              )}
                            </td>
                            <td className="text-right py-1">{item.quantity}</td>
                            <td className="text-right py-1">{item.total_amount?.toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="border-b border-dotted border-black my-2" />
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>SUBTOTAL:</span>
                        <span>{lastInvoice?.subtotal?.toFixed(2)}</span>
                      </div>
                      {lastInvoice?.cgst_total > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span>CGST:</span>
                            <span>{lastInvoice?.cgst_total?.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>SGST:</span>
                            <span>{lastInvoice?.sgst_total?.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                      {lastInvoice?.igst_total > 0 && (
                        <div className="flex justify-between">
                          <span>IGST:</span>
                          <span>{lastInvoice?.igst_total?.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-sm pt-1">
                        <span>GRAND TOTAL:</span>
                        <span>₹{lastInvoice?.grand_total?.toFixed(0)}</span>
                      </div>
                    </div>
                    <div className="text-center mt-6 text-[8px] opacity-50">
                      THANK YOU FOR YOUR VISIT
                    </div>
                 </div>
              </div>

              <div className="p-8 border-t bg-slate-50/50 flex gap-4">
                 <button 
                  onClick={() => setShowPrintPreview(false)}
                  className="flex-1 py-5 bg-white border border-slate-200 text-slate-600 rounded-[24px] font-black uppercase tracking-widest text-xs"
                 >
                   Close
                 </button>
                 <button 
                  onClick={handlePrint} disabled={!printReady}
                  className="flex-1 py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-200 flex items-center justify-center gap-3 disabled:opacity-50"
                 >
                   {printReady ? <><Printer size={18} /> Print Invoice</> : <><Loader2 className="animate-spin" size={18} /> Preparing...</>}
                 </button>
              </div>
           </div>
        </div>
      )}

      <PosPromotions
        isOpen={Boolean(promotionModal)}
        mode={promotionModal}
        onClose={() => setPromotionModal(null)}
        combos={activeCombos}
        offers={activeOffers}
        discounts={activeDiscounts}
        menuItems={menuItems}
        cartItems={cart.map(item => ({
          line_id: item.line_id,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
        }))}
        config={promotionConfig}
        selectedOfferIds={selectedOfferIds}
        manualDiscount={manualDiscount}
        autoAppliedPromotionIds={totals.autoAppliedPromotions.map(promo => promo.id)}
        onSelectOffer={offerId => setSelectedOfferIds(prev => prev.includes(offerId) ? prev.filter(id => id !== offerId) : [...prev, offerId])}
        onApplyManualDiscount={draft => {
          if (!canApplyManualDiscount) {
            alert('Manual discount requires manager permission.');
            return;
          }
          setManualDiscount(draft);
        }}
        onClearManualDiscount={() => setManualDiscount(null)}
        onAddCombo={handleAddCombo}
      />

      {/* THERMAL PRINT AREA */}
      <div
        id="print-area"
        aria-hidden="true"
        className={`print-staging ${String(paperWidth).includes('58') ? 'width-58mm' : ''}`}
      >
        <div className="center">
          <div className="bold large uppercase">{org?.name || 'PapaPos Restaurant'}</div>
          <div>{activeOutlet?.name}</div>
          <div>{activeOutlet?.address || activeOutlet?.location}</div>
          <div>{activeOutlet?.city} - {activeOutlet?.pincode}</div>
          {activeOutlet?.gst_registered && <div className="bold">GSTIN: {activeOutlet?.gst_number || 'UNREGISTERED'}</div>}
          {!activeOutlet?.gst_registered && <div className="bold">NON-GST INVOICE</div>}
          {activeOutlet?.phoneNumber && <div>Ph: {activeOutlet.phoneNumber}</div>}
        </div>

        <div className="dotted-line"></div>

        <div>
          <div>INV: {lastInvoice?.invoice_number || 'DRAFT'}</div>
          <div>DATE: {new Date(lastInvoice?.invoice_date || Date.now()).toLocaleString()}</div>
          <div>MODE: {lastInvoice?.payment_method || 'CASH'}</div>
          <div>STAFF: {currentUser?.full_name || 'Counter'}</div>
          <div>TID: {sessionService.getTerminalId().slice(-8).toUpperCase()}</div>
        </div>

        <div className="dotted-line"></div>

        <table>
          <thead>
            <tr>
              <th style={{ width: '40%' }}>ITEM</th>
              <th className="right" style={{ width: '10%' }}>QTY</th>
              <th className="right" style={{ width: '25%' }}>RATE</th>
              <th className="right" style={{ width: '25%' }}>AMT</th>
            </tr>
          </thead>
          <tbody>
            {(lastInvoice?.items || totals.processedItems).map((item: any) => (
              <tr key={item.id}>
                <td>
                  {item.name} {activeOutlet?.gst_registered && <span style={{ fontSize: '8px' }}>({item.tax_percentage}%)</span>}
                  {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                    <div style={{ fontSize: '8px', fontStyle: 'italic', color: '#666' }}>
                      + {item.selected_modifiers.map((m: any) => m.name).join(', ')}
                    </div>
                  )}
                </td>
                <td className="right">{item.quantity}</td>
                <td className="right">{item.price ?? item.unit_price}</td>
                <td className="right">{(item.total_amount ?? item.total_price ?? 0).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="dotted-line"></div>

        <div className="right">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{activeOutlet?.gst_registered ? 'SUBTOTAL:' : 'TOTAL:'}</span>
            <span>{(lastInvoice?.subtotal || 0).toFixed(2)}</span>
          </div>
          
          {activeOutlet?.gst_registered && lastInvoice?.taxBreakup && Object.entries(lastInvoice.taxBreakup).map(([rate, vals]: [string, any]) => (
            <div key={rate}>
               {vals.igst > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>IGST @ {rate}%:</span>
                    <span>{vals.igst.toFixed(2)}</span>
                  </div>
               ) : (
                 <>
                   <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                     <span>CGST @ {Number(rate)/2}%:</span>
                     <span>{vals.cgst.toFixed(2)}</span>
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                     <span>SGST @ {Number(rate)/2}%:</span>
                     <span>{vals.sgst.toFixed(2)}</span>
                   </div>
                 </>
               )}
            </div>
          ))}

          {activeOutlet?.gst_registered && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>TOTAL TAX:</span>
              <span>{(lastInvoice?.total_tax || 0).toFixed(2)}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>ROUND OFF:</span>
            <span>{(lastInvoice?.round_off || 0).toFixed(2)}</span>
          </div>

          <div className="dotted-line"></div>

          <div className="bold large" style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
            <span>GRAND TOTAL:</span>
            <span>₹{(lastInvoice?.grand_total || 0).toFixed(0)}</span>
          </div>
        </div>

        <div className="dotted-line"></div>

        {lastInvoice?.qr_payload && (
          <div className="center" style={{ marginTop: '10px' }}>
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(lastInvoice.qr_payload)}`} 
              alt="QR" 
              style={{ width: '80px', height: '80px' }}
            />
            <div style={{ fontSize: '8px', marginTop: '4px' }}>Scan for Invoice Details</div>
          </div>
        )}

        <div className="center" style={{ marginTop: '20px' }}>
          <div className="bold">THANK YOU FOR YOUR VISIT!</div>
          <div style={{ fontSize: '9px' }}>This is a computer generated receipt.</div>
          <div style={{ fontSize: '8px', color: '#666', marginTop: '5px' }}>Powered by PapaPos Pro</div>
        </div>
        
        <div style={{ height: '40px' }}></div>
      </div>

      {isCartOpen && <div onClick={() => setIsCartOpen(false)} className="md:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[900] animate-in fade-in" />}
      {showTableSelector && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md">
           <div className="bg-white rounded-[56px] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in duration-300">
              <div className="p-10 border-b bg-slate-50/50 flex justify-between items-center shrink-0">
                 <div><h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Floor Plan</h3><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Select an active table</p></div>
                 <button onClick={() => setShowTableSelector(false)} className="p-4 bg-white border border-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-all shadow-sm"><X size={28} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 pr-6">
                 {tables.length === 0 ? <div className="h-96 flex flex-col items-center justify-center text-slate-300 gap-4"><div className="p-8 bg-slate-50 rounded-[40px] border border-dashed border-slate-200"><Utensils size={64} className="opacity-20" /></div><p className="font-black uppercase tracking-widest text-xs">No tables defined</p></div> : (
                   <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-6">
                      {tables.map(table => (
                        <button key={table.id} onClick={() => { setSelectedTable(table); setShowTableSelector(false); }} className={`group aspect-square rounded-[40px] border-4 transition-all flex flex-col items-center justify-center gap-3 relative ${selectedTable?.id === table.id ? 'bg-indigo-600 border-indigo-200 scale-105 shadow-2xl' : table.status === 'occupied' ? 'bg-slate-50 border-slate-100 opacity-50' : 'bg-white border-slate-100 hover:border-orange-500 hover:scale-105 shadow-sm'}`}>
                           <Utensils size={24} className={selectedTable?.id === table.id ? 'text-white' : 'text-slate-400 group-hover:text-orange-500'} />
                           <div className="text-center"><span className={`font-black text-xl tracking-tight leading-none ${selectedTable?.id === table.id ? 'text-white' : 'text-slate-900'}`}>{table.name}</span><p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${selectedTable?.id === table.id ? 'text-indigo-200' : 'text-slate-400'}`}>{table.capacity}pax</p></div>
                        </button>
                      ))}
                   </div>
                 )}
              </div>
              <div className="p-10 border-t bg-slate-50/50 flex justify-end"><button onClick={() => setShowTableSelector(false)} className="px-12 py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-xs">Cancel</button></div>
           </div>
        </div>
     
     )}
    </div>
  );
};

export default POS;
