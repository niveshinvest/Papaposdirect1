import React, { useState, useEffect, useMemo } from 'react';
import { MenuItem, Table, OrderType, Invoice, CartItem, PaymentMode, Modifier } from '../types';
import { 
  ShoppingCart, Search, Plus, Minus, Receipt, 
  X, Utensils, Layers as LayersIcon, Info, WifiOff, Wifi,
  ChevronRight, Check, AlertCircle, Loader2,
  ChevronLeft, ShoppingBag, Printer, User, CreditCard, Wallet, Banknote,
  Mic, MicOff, Sparkles, Maximize, Minimize
} from 'lucide-react';
import { salesService } from '../services/salesService';
import { kitchenService } from '../services/kitchenService';
import { sessionService } from '../services/sessionService';
import { paymentService } from '../services/supabaseService';
import { printerService } from '../services/printerService';
import { db } from '../services/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { processVoiceInput, VoiceCommand } from '../services/voiceAssistantService';
import { GeminiLiveService } from '../services/GeminiLiveService';
import { motion, AnimatePresence } from 'framer-motion';

// --- Price Integrity Contract ---
interface ValidatedCartItem {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
  tax_percentage: number;
  price_includes_tax: boolean;
  hsn_code: string;
  total_price: number;
  selected_modifiers?: Modifier[];
}

const POS: React.FC<{ org: any; activeOutlet?: any; currentUser?: any }> = ({ org, activeOutlet, currentUser }) => {
  // UI State
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showTableSelector, setShowTableSelector] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(true);
  const [isDesktopCategoryOpen, setIsDesktopCategoryOpen] = useState(true);
  const [printerStatus, setPrinterStatus] = useState<{ available: boolean; name: string; type: string } | null>(null);
  const [printReady, setPrintReady] = useState(false);
  const [modifierItem, setModifierItem] = useState<any | null>(null);
  const [tempSelectedModifiers, setTempSelectedModifiers] = useState<Modifier[]>([]);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);

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

  // Responsive behavior
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    if (activeOutlet) {
      loadPaymentModes();
    }
  }, [activeOutlet]);

  const loadPaymentModes = async () => {
    try {
      if (!activeOutlet?.id) return;
      const modes = await paymentService.fetchActiveModes(activeOutlet.id);
      setPaymentModes(modes);
      const defaultMode = modes.find(m => m.is_default);
      if (defaultMode) setSelectedMop(defaultMode);
      else if (modes.length > 0) setSelectedMop(modes[0]);
    } catch (e) {
      console.error("MOP Load Failure:", e);
        const addToCart = (item: any, selectedMods: Modifier[] = []) => {
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

    if (item.modifiers && item.modifiers.length > 0 && selectedMods.length === 0 && !modifierItem) {
      setModifierItem(item);
      setTempSelectedModifiers([]);
      return;
    }

    const modifierPriceSum = selectedMods.reduce(
      (sum, mod) => sum + Number(mod.price || 0),
      0
    );

    const effectiveUnitPrice = sanitizedPrice + modifierPriceSum;

    setCart(prev => {
      const existing = prev.find(i =>
        i.id === item.id &&
        JSON.stringify(i.selected_modifiers || []) === JSON.stringify(selectedMods)
      );

      if (existing) {
        return prev.map(i => (i.id === item.id && JSON.stringify(i.selected_modifiers || []) === JSON.stringify(selectedMods))
          ? { ...i, quantity: i.quantity + 1, total_price: effectiveUnitPrice * (i.quantity + 1) }
          : i
        );
      }

      const newItem: ValidatedCartItem = {
        id: item.id,
        name: item.name,
        unit_price: sanitizedPrice,
        quantity: 1,
        tax_percentage: Number(item.tax_percentage ?? item.gst_rate ?? 5),
        price_includes_tax: Boolean(item.price_includes_tax ?? item.is_tax_inclusive ?? false),
        hsn_code: String(item.hsn_code || '9963'),
        total_price: effectiveUnitPrice,
        selected_modifiers: selectedMods.length > 0 ? selectedMods : undefined
      };
      return [...prev, newItem];
    });

    setModifierItem(null);
    setTempSelectedModifiers([]);
    if (!isMobileView && !isCartOpen) setIsCartOpen(true);
  };

  const startListening = () => {
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

  const startGeminiLive = () => {
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
    }
  };

  const updateQuantity = (id: string, delta: number, modifiers?: Modifier[]) => {
    setCart(prev => prev.map(item => {
      const match = item.id === id && JSON.stringify(item.selected_modifiers || []) === JSON.stringify(modifiers || []);
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

  const totals = useMemo(() => {
    const outletState = activeOutlet?.gst_state_code || activeOutlet?.state_code || '27';
    const destState = buyerState || outletState;
    const gstRegistered = activeOutlet?.gst_registered ?? false;

    const processed = cart.map(item => {
    return salesService.calculateItemGst(
    {
      ...item,
      price: item.unit_price,
      base_price: item.unit_price,
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

  useEffect(() => {
    const checkPrinter = async () => {
      const status = await printerService.checkAvailability();
      setPrinterStatus(status);
    };
    checkPrinter();
  }, []);

  useEffect(() => {
    if (showPrintPreview) {
      setPrintReady(false);
      requestAnimationFrame(() => {
        setTimeout(() => setPrintReady(true), 500);
      });
    }
  }, [showPrintPreview, lastInvoice]);

  const handlePrint = async () => {
    if (!lastInvoice || !printReady) return;

    const result = await printerService.printInvoice(lastInvoice, {
      paperWidth,
      silent: true
    });

    if (result.success) {
      console.log(`Print Success: ${result.method}`);
    } else {
      alert(`Print Failed: ${result.error}`);
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
        buyer_gstin: buyerGstin || null,
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
        payment_method: selectedMop?.name || 'Cash',
        payment_mode_id: selectedMop?.id,
        payment_mode_name: selectedMop?.name,
        finalized_by_user_id: currentUser.id,
        finalized_at: invDate,
        qr_payload: qrPayload || undefined,
        irp_status: 'NOT_GENERATED'
      };

      const invoice = await db.createSyncableRecord(db.invoices, invoiceData, ctx);

      const invoiceItemRows = totals.processedItems.map(item => ({
        id: crypto.randomUUID(),
        invoice_id: invoice.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        selected_modifiers: item.selected_modifiers,
        taxable_value: item.taxable_value,
        cgst_amount: item.cgst_amount,
        sgst_amount: item.sgst_amount,
        igst_amount: item.igst_amount,
        total_amount: item.total_amount,
        company_id: currentUser.company_id,
        outlet_id: activeOutlet.id,
        sync_status: 'pending',
        created_at: new Date()
      }));

      await db.invoice_items.bulkPut(invoiceItemRows);

      setLastInvoice({ ...invoice, items: totals.processedItems });
      setShowPrintPreview(true);

      if (printerStatus?.available && printerService.getPlatform() !== 'BROWSER') {
        // Auto-print ready
      }

      setCart([]);
      setSelectedTable(null);

      if (isOnline) {
        await kitchenService.createTicket({
          order_id: order.id,
          outlet_id: activeOutlet.id,
          table_name: orderData.tableId,
          items: cart.map(i => ({ name: i.name, quantity: i.quantity, notes: '' })),
        });
      }

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

  // MAIN RETURN / JSX
  return (
    <div className="relative flex flex-col h-screen bg-slate-50 overflow-hidden print:p-0 print:bg-white">
      <style>{`
        @media print {
          @page { margin: 0; }
          body { margin: 0; padding: 0; background: #fff; }
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: ${paperWidth === '80mm' ? '300px' : '220px'};
            padding: 5px;
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            color: #000;
            background: #fff;
            line-height: 1.2;
          }
          .no-print { display: none !important; }
          .dotted-line { border-bottom: 1px dotted #000; margin: 5px 0; width: 100%; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .large { font-size: 16px; }
          .right { text-align: right; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 2px 0; text-align: left; vertical-align: top; }
        }
      `}</style>

      {/* ===== ENHANCED HEADER ===== */}
      <div className="shrink-0 bg-gradient-to-b from-white to-slate-50 border-b border-slate-100 px-4 md:px-6 py-4 space-y-4 no-print">
        {/* Top Bar: Branding + Controls */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg flex-shrink-0">
              {org?.name?.charAt(0) || 'P'}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-black text-slate-900 leading-tight tracking-tight">{activeOutlet?.name || 'PapaPos'}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{org?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={isListening ? stopListening : startListening}
              className={`p-2.5 md:p-3 rounded-lg transition-all ${
                isListening ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'
              }`}
              title="Voice Assistant"
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

  const filteredItems = menuItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (selectedCategory === 'All' || item.category === selectedCategory)
  );
  const desktopCategoryList = useMemo(() => ['All', ...categories.map((c) => c.name)], [categories]);

  return (
    <div className="relative flex flex-col h-full bg-slate-50 overflow-hidden print:p-0 print:bg-white">
      {/* Header / Nav */}
      <div className="shrink-0 bg-white border-b px-6 py-4 space-y-4 no-print">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex bg-slate-100 p-1.5 rounded-3xl border shadow-inner shrink-0 lg:hidden">
             {['DINE_IN', 'TAKEAWAY', 'DELIVERY'].map(type => (
               <button key={type} onClick={() => setOrderType(type as OrderType)} className={`px-3 md:px-4 py-2 rounded-md text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${orderType === type ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{type.replace('_', ' ')}</button>
             ))}
          </div>

          {orderType === 'DINE_IN' && (
            <button onClick={() => setShowTableSelector(true)} className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all flex-shrink-0 text-sm font-bold ${selectedTable ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-200'}`}>
              <Utensils size={16} />
              <span>{selectedTable ? `Table ${selectedTable.name}` : 'Select Table'}</span>
            </button>
          )}
        </div>

        {/* Search & Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search menu..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm font-medium shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex bg-indigo-50 p-1.5 rounded-3xl border border-indigo-100 lg:hidden">
            {['80mm', '58mm'].map(w => (
               <button key={w} onClick={() => setPaperWidth(w as any)} className={`px-3 py-2 rounded-md text-[10px] font-black uppercase transition-all ${paperWidth === w ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-400'}`}>{w}</button>
            ))}
          </div>
          <button 
            onClick={toggleFullscreen}
            className="p-3 lg:p-4 bg-slate-100 text-slate-400 rounded-3xl hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-sm touch-manipulation lg:hidden"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide lg:hidden">
          {['All', ...categories.map(c => c.name)].map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-6 py-3 lg:px-7 lg:py-4 rounded-full whitespace-nowrap font-black text-[10px] lg:text-[11px] uppercase transition-all border-2 touch-manipulation ${selectedCategory === cat ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}>{cat}</button>
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
          ))}
        </div>
      </div>

      {/* AI Voice Assistant Overlay */}
      <AnimatePresence>
        {aiStatus && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-4 pointer-events-none"
          >
            <div className={`bg-white rounded-2xl shadow-2xl border-2 p-4 flex items-center gap-4 pointer-events-auto transition-colors duration-300 ${
              aiStatus.type === 'success' ? 'border-emerald-500' :
              aiStatus.type === 'error' ? 'border-rose-500' :
              aiStatus.type === 'warning' ? 'border-amber-500' :
              'border-indigo-500'
            }`}>
              <div className={`p-3 rounded-xl transition-colors duration-300 flex-shrink-0 ${
                currentVoiceState === 'PROCESSING' ? 'bg-orange-50' :
                currentVoiceState === 'SPEAKING' ? 'bg-emerald-50' :
                currentVoiceState === 'LISTENING' ? 'bg-indigo-50' :
                currentVoiceState === 'EXECUTING' ? 'bg-emerald-100' :
                currentVoiceState === 'WAITING_FOR_CONFIRMATION' ? 'bg-amber-50' :
                'bg-slate-50'
              }`}>
                {currentVoiceState === 'LISTENING' ? (
                  <Mic className="text-indigo-600" size={20} />
                ) : currentVoiceState === 'PROCESSING' ? (
                  <Loader2 className="text-orange-600 animate-spin" size={20} />
                ) : currentVoiceState === 'SPEAKING' ? (
                  <Sparkles className="text-emerald-600" size={20} />
                ) : currentVoiceState === 'EXECUTING' ? (
                  <Check className="text-emerald-600" size={20} />
                ) : currentVoiceState === 'WAITING_FOR_CONFIRMATION' ? (
                  <Info className="text-amber-600" size={20} />
                ) : (
                  <MicOff className="text-slate-400" size={20} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{aiStatus.message}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Menu Grid */}
      <div className="flex-1 overflow-hidden no-print">
        <div className="h-full min-h-0 lg:flex lg:bg-slate-50 relative">
          <div className={`hidden lg:flex ${isDesktopCategoryOpen ? 'lg:w-56' : 'lg:w-0'} lg:shrink-0 bg-white text-slate-700 flex-col border-r border-slate-200 transition-all duration-300 overflow-hidden`}>
            <button
              onClick={() => setIsDesktopCategoryOpen((open) => !open)}
              className="flex items-center justify-between gap-2 px-3 py-3 border-b border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"><LayersIcon size={14} /> Categories</span>
              <ChevronLeft size={16} />
            </button>
            {desktopCategoryList.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-4 text-left text-sm font-bold border-b border-slate-100 transition-colors ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block truncate">{cat}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setIsDesktopCategoryOpen((open) => !open)}
            className="hidden lg:flex h-12 w-7 absolute top-4 z-20 items-center justify-center rounded-r-xl border border-l-0 border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            style={{ left: isDesktopCategoryOpen ? '14rem' : '0rem' }}
            title={isDesktopCategoryOpen ? 'Collapse categories' : 'Expand categories'}
          >
            {isDesktopCategoryOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
          <div className={`min-w-0 flex-1 min-h-0 overflow-y-auto p-4 lg:p-5 lg:pl-12 pb-32 lg:pb-6 scrollbar-hide transition-all duration-500 ease-in-out ${isCatalogOpen ? 'opacity-100' : 'lg:w-0 lg:flex-none opacity-0 pointer-events-none overflow-hidden p-0'}`}>
        {priceError && <div className="mb-6 bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-600 animate-in fade-in slide-in-from-top-4"><AlertCircle size={20} /><p className="font-bold text-sm">{priceError}</p></div>}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {filteredItems.map(item => (
            <div key={item.id} onClick={() => addToCart(item)} className="bg-white rounded-md lg:rounded-none overflow-hidden border border-slate-200 hover:border-orange-500 cursor-pointer active:scale-95 transition-all shadow-sm group hover:shadow-md touch-manipulation min-h-[88px]">
              <div className="h-32 lg:hidden bg-slate-50 relative overflow-hidden">
                {item.image_url || item.image ? <img src={item.image_url || item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={item.name} /> : <div className="w-full h-full flex items-center justify-center text-slate-200"><Utensils size={32} /></div>}
                <div className="absolute top-3 right-3 bg-white/95 px-3 py-1.5 rounded-xl text-[10px] font-black text-orange-600 shadow-xl border border-white/50">₹{item.base_price ?? item.price}</div>
              </div>
              <div className="p-4 lg:p-4">
                <h4 className="font-black text-sm lg:text-[30px] lg:leading-8 text-slate-800 leading-tight h-10 lg:h-16 line-clamp-2">{item.name}</h4>
                <div className="flex items-center justify-between mt-4 lg:mt-2">
                   <p className="text-[9px] lg:text-xs text-slate-400 font-black uppercase tracking-tighter">{item.menu_categories?.name || item.category}</p>
                   <div className="p-2.5 bg-slate-50 text-slate-300 rounded-xl group-hover:bg-orange-50 group-hover:text-orange-500 transition-colors"><Plus size={16} /></div>
                </div>
              </div>
            </div>
          ))}
        </div>
          </div>
          <div className="hidden lg:flex lg:w-[430px] xl:w-[460px] lg:shrink-0 lg:h-full min-h-0 border-l border-slate-300 bg-white">
            <div className="flex h-full min-h-0 w-full flex-col relative overflow-hidden">
              <div className="p-0 border-b border-slate-300 shrink-0">
                <div className="grid grid-cols-3 bg-slate-800 text-white text-center">
                  {[
                    { key: 'DINE_IN', label: 'DINE IN' },
                    { key: 'DELIVERY', label: 'DELIVERY' },
                    { key: 'TAKEAWAY', label: 'PICK UP' }
                  ].map(mode => (
                    <button
                      key={mode.key}
                      onClick={() => setOrderType(mode.key as OrderType)}
                      className={`py-4 font-black text-sm border-r border-slate-700 last:border-r-0 ${orderType === mode.key ? 'bg-orange-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-6 border-b flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-orange-500 rounded-[24px] flex items-center justify-center text-white shadow-xl"><ShoppingBag size={30} /></div>
                  <div><h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Checkout</h3><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1.5">{orderType} • {selectedTable?.name || 'Quick Sale'}</p></div>
                </div>
                <button onClick={() => setIsCatalogOpen((open) => !open)} className="flex items-center gap-2 px-5 py-4 bg-slate-50 hover:bg-slate-100 rounded-3xl text-slate-500 transition-all border border-slate-200 touch-manipulation">
                  {isCatalogOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                  <span className="text-[10px] font-black uppercase tracking-widest">{isCatalogOpen ? 'Hide Menu' : 'Show Menu'}</span>
                </button>
              </div>

        {filteredItems.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-center gap-4">
            <div className="p-6 bg-slate-100 rounded-2xl"><Utensils size={48} className="text-slate-300" /></div>
            <p className="font-bold text-slate-400 text-sm uppercase tracking-wide">No items found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
            {filteredItems.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
                onClick={() => addToCart(item)}
                className="bg-white rounded-2xl overflow-hidden border border-slate-100 hover:border-orange-500 hover:shadow-xl cursor-pointer active:scale-95 transition-all shadow-sm group"
              >
                <div className="aspect-square bg-slate-100 relative overflow-hidden">
                  {item.image_url || item.image ? (
                    <img src={item.image_url || item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={item.name} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-200"><Utensils size={28} /></div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm px-2 py-1 rounded-lg text-[11px] font-black text-orange-600 shadow-lg border border-white/50">
                    ₹{item.base_price ?? item.price}
                  </div>
                </div>
                <div className="p-3">
                  <h4 className="font-bold text-xs text-slate-800 line-clamp-2 leading-tight">{item.name}</h4>
                  <div className="flex items-center justify-between mt-2.5">
                     <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">{item.menu_categories?.name || item.category}</p>
                     <div className="p-1 bg-slate-50 text-slate-300 rounded-md group-hover:bg-orange-50 group-hover:text-orange-500 transition-colors"><Plus size={12} /></div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ===== FLOATING CTA (Enhanced) ===== */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            onClick={() => setIsCartOpen(true)}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-3 md:gap-4 bg-slate-900 text-white px-4 md:px-6 py-3 md:py-4 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all group no-print"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{totals.itemCount} {totals.itemCount === 1 ? 'Item' : 'Items'}</span>
              <span className="text-lg md:text-xl font-black text-orange-500">₹{totals.grandTotal}</span>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg group-hover:bg-orange-400 transition-colors flex-shrink-0">
              <ShoppingCart size={20} />
            </div>
          </motion.button>
        )}
      </AnimatePresence>

              <div className="flex-1 min-h-0 overflow-y-auto p-8 space-y-8 scrollbar-hide pb-[320px]">
                {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30"><Utensils size={64} className="text-slate-300" /><p className="font-black text-xs uppercase tracking-widest">Cart is Empty</p></div> : cart.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className="flex justify-between items-start animate-in slide-in-from-right-4 duration-300">
                    <div className="flex-1 min-w-0 pr-4">
                      <h5 className="font-black text-sm text-slate-800 truncate">{item.name}</h5>
                      {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mt-1">
                          + {item.selected_modifiers.map(m => m.name).join(', ')}
                        </p>
                      )}
                      <p className="text-[10px] font-black text-slate-400 uppercase mt-1">
                        Rs. {item.unit_price + (item.selected_modifiers || []).reduce((s, m) => s + m.price, 0)} @ {item.tax_percentage}% GST 
                        {item.price_includes_tax ? <span className="ml-1 text-emerald-600">(Incl)</span> : <span className="ml-1 text-orange-600">(Excl)</span>}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-lg md:text-xl font-black text-slate-900 leading-tight">Checkout</h3>
                      <p className="text-[9px] font-bold uppercase text-slate-400 tracking-widest mt-1">{orderType.replace('_', ' ')} • {selectedTable?.name || 'Quick Sale'}</p>
                    </div>
                 </div>
                 <button onClick={() => setIsCartOpen(false)} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-400 transition-all">
                   <X size={22} />
                 </button>
              </div>
              <div className="p-5 bg-slate-900 text-white space-y-4 border-t border-slate-700 shadow-2xl shrink-0 absolute bottom-0 left-0 right-0 z-20">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500"><span>Taxable Value</span><span className="text-slate-300">Rs. {totals.subtotal.toFixed(2)}</span></div>
                  
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
                 </div>
                 <button
                   onClick={() => setShowPaymentPicker(true)}
                   className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-[8px] uppercase tracking-widest text-indigo-600 hover:bg-indigo-100 transition-all"
                 >
                    Change
                 </button>
              </div>

                  {activeOutlet?.gst_registered && <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 pt-2 border-t border-white/5"><span>Total Tax</span><span className="text-slate-300">Rs. {totals.totalTax.toFixed(2)}</span></div>}
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500"><span>Round-off</span><span className={totals.roundOff < 0 ? 'text-rose-400' : 'text-emerald-400'}>Rs. {totals.roundOff.toFixed(2)}</span></div>
                </div>
                <div className="flex justify-between items-end pt-4 border-t border-white/10">
                  <div><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Grand Payable</p><span className="font-black text-3xl text-orange-500 tracking-tighter">Rs. {totals.grandTotal}</span></div>
                  <div className="flex flex-col items-end gap-2">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${isOnline ? 'border-emerald-500/20 text-emerald-500' : 'border-rose-500/20 text-rose-500'}`}>{isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}<span className="text-[9px] font-black uppercase">{isOnline ? 'Sync' : 'Local'}</span></div>
                    {printerStatus && (
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${printerStatus.available ? 'border-indigo-500/20 text-indigo-400' : 'border-rose-500/20 text-rose-400'}`}>
                        <Printer size={14} />
                        <span className="text-[9px] font-black uppercase">{printerStatus.available ? printerStatus.name : 'Offline'}</span>
                      </div>
                    )}
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
                      FINALIZE & PRINT (Rs. {totals.grandTotal})
                    </>
                  )}
                </button>
              </div>

              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 scrollbar-hide">
                 {cart.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                     <Utensils size={48} className="text-slate-300 mb-3" />
                     <p className="font-bold text-xs uppercase tracking-widest text-slate-400">Cart is Empty</p>
                   </div>
                 ) : (
                   cart.map((item, idx) => (
                     <motion.div
                       key={`${item.id}-${idx}`}
                       initial={{ opacity: 0, x: 20 }}
                       animate={{ opacity: 1, x: 0 }}
                       className="flex justify-between items-start gap-4 pb-6 border-b border-slate-100 last:border-b-0"
                     >
                        <div className="flex-1 min-w-0">
                           <h5 className="font-bold text-sm text-slate-800 line-clamp-2">{item.name}</h5>
                           {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                             <p className="text-[9px] font-bold text-orange-500 uppercase mt-1">
                               + {item.selected_modifiers.map(m => m.name).join(', ')}
                             </p>
                           )}
                           <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">
                              ₹{(item.unit_price + (item.selected_modifiers || []).reduce((s, m) => s + m.price, 0)).toFixed(0)} • {item.tax_percentage}% GST
                           </p>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                           <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shadow-inner">
                             <button onClick={() => updateQuantity(item.id, -1, item.selected_modifiers)} className="p-1.5 hover:bg-white rounded transition-all"><Minus size={14} /></button>
                             <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                             <button onClick={() => updateQuantity(item.id, 1, item.selected_modifiers)} className="p-1.5 hover:bg-white rounded transition-all"><Plus size={14} /></button>
                           </div>
                           <div className="w-20 text-right">
                             <span className="font-bold text-sm text-slate-900">₹{Number(item.total_price || 0).toFixed(0)}</span>
                           </div>
                        </div>
                     </motion.div>
                   ))
                 )}
              </div>

              {/* Totals Footer */}
              <div className="p-6 md:p-8 bg-gradient-to-t from-slate-900 to-slate-800 text-white space-y-6 rounded-t-3xl shadow-2xl shrink-0">
                 <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                      <span>Subtotal</span>
                      <span className="text-slate-300">₹{totals.subtotal.toFixed(2)}</span>
                    </div>

                    {activeOutlet?.gst_registered && Object.entries(totals.taxBreakup).map(([rate, vals]: [string, any]) => (
                       <div key={rate} className="space-y-1">
                          {vals.igst > 0 ? (
                             <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 italic">
                                <span>IGST @ {rate}%</span>
                                <span className="text-slate-300">₹{vals.igst.toFixed(2)}</span>
                             </div>
                          ) : (
                             <>
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 italic">
                                   <span>CGST @ {Number(rate)/2}%</span>
                                   <span className="text-slate-300">₹{vals.cgst.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 italic">
                                   <span>SGST @ {Number(rate)/2}%</span>
                                   <span className="text-slate-300">₹{vals.sgst.toFixed(2)}</span>
                                </div>
                             </>
                          )}
                       </div>
                    ))}

                    {activeOutlet?.gst_registered && (
                      <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 pt-1 border-t border-white/10">
                        <span>Tax Total</span>
                        <span className="text-slate-300">₹{totals.totalTax.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                      <span>Round-off</span>
                      <span className={totals.roundOff < 0 ? 'text-rose-400' : 'text-emerald-400'}>{totals.roundOff > 0 ? '+' : ''}₹{totals.roundOff.toFixed(2)}</span>
                    </div>
                 </div>

                 <div className="flex justify-between items-end pt-4 border-t border-white/10">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Payable</p>
                      <span className="font-black text-3xl md:text-4xl text-orange-400 tracking-tighter">₹{totals.grandTotal}</span>
                    </div>
                 </div>

                 <button
                   onClick={handleFinalizeAndPrint}
                   disabled={cart.length === 0 || isProcessing || !selectedMop}
                   className="w-full py-4 md:py-5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-bold uppercase tracking-widest text-sm shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                 >
                    {isProcessing ? <Loader2 className="animate-spin" size={20} /> : (
                      <>
                        <Printer size={18} />
                        FINALIZE & PRINT
                      </>
                    )}
                 </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== MODIFIER MODAL ===== */}
      <AnimatePresence>
        {modifierItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md"
          >
             <motion.div
               initial={{ scale: 0.9, y: 20 }}
               animate={{ scale: 1, y: 0 }}
               className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden"
             >
                <div className="p-8 bg-slate-900 text-white flex justify-between items-start">
                   <div>
                      <h3 className="text-2xl font-black tracking-tight uppercase">Customize</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">{modifierItem.name}</p>
                   </div>
                   <button onClick={() => setModifierItem(null)} className="p-2 hover:bg-white/10 rounded-lg transition-all"><X size={24} /></button>
                </div>
                <div className="p-8 space-y-6">
                   <div className="space-y-3">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select Modifiers</label>
                      <div className="space-y-3">
                         {modifierItem.modifiers?.map((mod: Modifier) => (
                           <motion.button
                             key={mod.id}
                             onClick={() => toggleModifier(mod)}
                             whileHover={{ scale: 1.02 }}
                             className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                               tempSelectedModifiers.find(m => m.id === mod.id)
                                 ? 'border-orange-500 bg-orange-50'
                                 : 'border-slate-200 bg-white hover:border-slate-300'
                             }`}
                           >
                              <div className="flex items-center gap-3">
                                 <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                                   tempSelectedModifiers.find(m => m.id === mod.id)
                                     ? 'bg-orange-500 border-orange-500 text-white'
                                     : 'border-slate-300'
                                 }`}>
                                    {tempSelectedModifiers.find(m => m.id === mod.id) && <Check size={12} />}
                                 </div>
                                 <span className="font-bold text-sm text-slate-800">{mod.name}</span>
                              </div>
                              <span className="font-bold text-xs text-slate-500">
                                 {mod.price > 0 ? `+₹${mod.price}` : 'Free'}
                              </span>
                           </motion.button>
                         ))}
                      </div>
                   </div>

                   <button
                     onClick={() => addToCart(modifierItem, tempSelectedModifiers)}
                     className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-widest text-sm shadow-lg hover:bg-slate-800 transition-all"
                   >
                      Add to Order (₹{(Number(modifierItem.base_price ?? modifierItem.price) + tempSelectedModifiers.reduce((s, m) => s + m.price, 0)).toFixed(0)})
                   </button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== PAYMENT MODE PICKER ===== */}
      <AnimatePresence>
        {showPaymentPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md"
          >
             <motion.div
               initial={{ scale: 0.9 }}
               animate={{ scale: 1 }}
               className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
             >
                <div className="p-8 border-b bg-slate-50 flex justify-between items-start shrink-0">
                   <div>
                     <h3 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Payment</h3>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Select settlement method</p>
                   </div>
                   <button onClick={() => setShowPaymentPicker(false)} className="p-3 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-slate-900 transition-all"><X size={24} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 space-y-3">
                   {paymentModes.map(mop => (
                     <motion.button
                       key={mop.id}
                       onClick={() => { setSelectedMop(mop); setShowPaymentPicker(false); }}
                       whileHover={{ scale: 1.02 }}
                       className={`w-full flex items-center justify-between p-5 rounded-xl border-2 transition-all ${selectedMop?.id === mop.id ? 'bg-indigo-50 border-indigo-500 shadow-md' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                     >
                        <div className="flex items-center gap-4">
                           <div className={`p-3 rounded-xl ${selectedMop?.id === mop.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                              {getMopIcon(mop.type)}
                           </div>
                           <div className="text-left">
                              <p className="font-bold text-slate-900">{mop.name}</p>
                              {mop.is_default && <span className="text-[8px] font-bold uppercase text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded mt-1 inline-block">Default</span>}
                           </div>
                        </div>
                        {selectedMop?.id === mop.id && <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-white"><Check size={16} /></div>}
                     </motion.button>
                   ))}
                </div>
                <div className="p-8 border-t bg-slate-50 flex justify-end">
                   <button onClick={() => setShowPaymentPicker(false)} className="px-8 py-3 bg-slate-900 text-white rounded-lg font-bold uppercase tracking-widest text-xs">Done</button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

            {/* ===== PRINT PREVIEW ===== */}
      <AnimatePresence>
        {showPrintPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md"
          >
             <motion.div
               initial={{ scale: 0.9 }}
               animate={{ scale: 1 }}
               className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
             >
                <div className="p-8 border-b bg-slate-50 flex justify-between items-start">
                   <div>
                     <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">Invoice Preview</h3>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Verify before printing</p>
                   </div>
                   <button onClick={() => setShowPrintPreview(false)} className="p-3 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-slate-900 transition-all"><X size={24} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex justify-center">
                   <div className={`bg-white shadow-xl p-5 font-mono text-[9px] text-black ${paperWidth === '80mm' ? 'w-[280px]' : 'w-[200px]'}`}>
                    <div className="text-center mb-3 space-y-0.5 text-[10px]">
                      <div className="font-bold uppercase text-sm">{org?.name}</div>
                      <div className="font-bold">{activeOutlet?.name}</div>
                      <div className="text-[8px]">{activeOutlet?.address}</div>
                      {activeOutlet?.gst_registered ? (
                        <div className="font-bold mt-0.5">GSTIN: {activeOutlet?.gst_number}</div>
                      ) : (
                        <div className="font-bold mt-0.5">NON-GST</div>
                      )}
                    </div>
                    <div className="border-b border-dashed border-black my-2" />
                    <div className="space-y-0.5 text-[9px]">
                      <div>INV: {lastInvoice?.invoice_number}</div>
                      <div>DATE: {new Date(lastInvoice?.invoice_date).toLocaleString()}</div>
                      <div>MODE: {lastInvoice?.payment_method}</div>
                    </div>
                    <div className="border-b border-dashed border-black my-2" />
                    <table className="w-full text-left text-[8px]">
                      <tbody>
                        {lastInvoice?.items?.slice(0, 8).map((item: any, i: number) => (
                          <tr key={i} className="border-b border-dashed border-slate-200">
                            <td className="py-0.5">{item.name?.substring(0, 12)}</td>
                            <td className="text-right py-0.5 w-8">{item.quantity}</td>
                            <td className="text-right py-0.5 w-10">{(item.total_amount || 0).toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="border-b border-dashed border-black my-2" />
                    <div className="space-y-0.5 text-right text-[9px]">
                      <div className="flex justify-between"><span>SUBTOTAL:</span><span>{lastInvoice?.subtotal?.toFixed(0)}</span></div>
                      {lastInvoice?.total_tax > 0 && <div className="flex justify-between font-bold"><span>TAX:</span><span>{lastInvoice?.total_tax?.toFixed(0)}</span></div>}
                      <div className="flex justify-between font-black text-[10px] pt-0.5"><span>TOTAL:</span><span>₹{lastInvoice?.grand_total?.toFixed(0)}</span></div>
                    </div>
                    <div className="text-center mt-3 text-[7px] opacity-50">THANK YOU</div>
                   </div>
                </div>

                <div className="p-8 border-t bg-slate-50 flex gap-4">
                   <button
                    onClick={() => setShowPrintPreview(false)}
                    className="flex-1 py-3 bg-white border border-slate-300 text-slate-600 rounded-lg font-bold uppercase tracking-widest text-xs"
                   >
                     Close
                   </button>
                   <button
                    onClick={handlePrint}
                    disabled={!printReady}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-bold uppercase tracking-widest text-xs shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                   >
                     {printReady ? <><Printer size={16} /> Print</> : <Loader2 className="animate-spin" size={16} />}
                   </button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== TABLE SELECTOR ===== */}
      <AnimatePresence>
        {showTableSelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md"
          >
             <motion.div
               initial={{ scale: 0.9 }}
               animate={{ scale: 1 }}
               className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
             >
                <div className="p-8 border-b bg-slate-50 flex justify-between items-start shrink-0">
                   <div>
                     <h3 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Floor Plan</h3>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Select a table</p>
                   </div>
                   <button onClick={() => setShowTableSelector(false)} className="p-3 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-slate-900 transition-all"><X size={24} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-8">
                   {tables.length === 0 ? (
                     <div className="h-96 flex flex-col items-center justify-center text-slate-300 gap-4">
                       <Utensils size={48} className="opacity-20" />
                       <p className="font-bold uppercase tracking-widest text-xs">No tables available</p>
                     </div>
                   ) : (
                     <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                        {tables.map(table => (
                          <motion.button
                            key={table.id}
                            onClick={() => { setSelectedTable(table); setShowTableSelector(false); }}
                            whileHover={{ scale: 1.05 }}
                            className={`aspect-square rounded-2xl border-3 transition-all flex flex-col items-center justify-center gap-2 ${selectedTable?.id === table.id ? 'bg-indigo-600 border-indigo-200 shadow-lg' : table.status === 'occupied' ? 'bg-slate-100 border-slate-300 opacity-50 cursor-not-allowed' : 'bg-white border-slate-200 hover:border-orange-500'}`}
                          >
                             <Utensils size={20} className={selectedTable?.id === table.id ? 'text-white' : 'text-slate-400'} />
                             <div className="text-center">
                               <span className={`font-bold text-sm ${selectedTable?.id === table.id ? 'text-white' : 'text-slate-900'}`}>{table.name}</span>
                               <p className={`text-[8px] font-bold uppercase tracking-tighter ${selectedTable?.id === table.id ? 'text-indigo-200' : 'text-slate-400'}`}>{table.capacity} pax</p>
                             </div>
                          </motion.button>
                        ))}
                     </div>
                   )}
                </div>
                <div className="p-8 border-t bg-slate-50 flex justify-end">
                   <button onClick={() => setShowTableSelector(false)} className="px-8 py-3 bg-slate-900 text-white rounded-lg font-bold uppercase tracking-widest text-xs">Cancel</button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Print Area - Thermal Printer */}
      <div id="print-area" className="hidden">
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
            <span>{totals.subtotal.toFixed(2)}</span>
          </div>

          {activeOutlet?.gst_registered && Object.entries(totals.taxBreakup).map(([rate, vals]: [string, any]) => (
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
              <span>{totals.totalTax.toFixed(2)}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>ROUND OFF:</span>
            <span>{totals.roundOff.toFixed(2)}</span>
          </div>

          <div className="dotted-line"></div>

          <div className="bold large" style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
            <span>GRAND TOTAL:</span>
            <span>₹{totals.grandTotal.toFixed(0)}</span>
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
    </div>
  );
};

export default POS;
