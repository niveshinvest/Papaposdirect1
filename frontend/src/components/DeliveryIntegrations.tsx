
import React, { useState, useEffect, useRef } from 'react';
import { 
  Bike, Power, RefreshCw, Check, X, 
  Clock, MapPin, Phone, ChevronRight, 
  ExternalLink, Lock, User, ShieldCheck, 
  Bell, AlertCircle, ShoppingBag, Loader2
} from 'lucide-react';

interface DeliveryOrder {
  id: string;
  platform: 'Zomato' | 'Swiggy';
  customer: string;
  items: { name: string; qty: number }[];
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'picked';
  timestamp: string;
}

// Simulated Zomato API Service
const ZomatoAPI = {
  fetchOrders: async (): Promise<DeliveryOrder[]> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1200));
    return [
      { 
        id: `Z-${Math.floor(Math.random() * 9000 + 1000)}`, 
        platform: 'Zomato', 
        customer: 'Simran J.', 
        items: [{ name: 'Butter Chicken', qty: 1 }, { name: 'Garlic Naan', qty: 2 }], 
        total: 540, status: 'pending', timestamp: 'Just now' 
      }
    ];
  },
  updateStatus: async (orderId: string, status: DeliveryOrder['status']): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    return true; // Simulate success
  }
};

const DeliveryIntegrations: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'zomato' | 'swiggy'>('zomato');
  const [zomatoStatus, setZomatoStatus] = useState(false);
  const [swiggyStatus, setSwiggyStatus] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [activePlatform, setActivePlatform] = useState<'Zomato' | 'Swiggy' | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  
  const [orders, setOrders] = useState<DeliveryOrder[]>([
    { 
      id: 'Z-8291', platform: 'Zomato', customer: 'Rahul K.', 
      items: [{ name: 'Chicken Biryani', qty: 2 }, { name: 'Coke 500ml', qty: 1 }], 
      total: 720, status: 'pending', timestamp: '2 mins ago' 
    },
    { 
      id: 'S-1022', platform: 'Swiggy', customer: 'Aditi S.', 
      items: [{ name: 'Paneer Butter Masala', qty: 1 }, { name: 'Butter Naan', qty: 3 }], 
      total: 480, status: 'preparing', timestamp: '10 mins ago' 
    }
  ]);

  // Polling simulation for new orders when Zomato is Online
  useEffect(() => {
    let interval: any;
    if (zomatoStatus) {
      interval = setInterval(async () => {
        // Randomly "receive" a new order every 45-60 seconds for demo purposes
        if (Math.random() > 0.7) {
          const newOrders = await ZomatoAPI.fetchOrders();
          setOrders(prev => [...newOrders, ...prev]);
          // Use a basic notification or sound logic here in real apps
          console.log("New Zomato Order Inbound!");
        }
      }, 15000); // Check every 15s in this demo
    }
    return () => clearInterval(interval);
  }, [zomatoStatus]);

  const toggleStatus = (platform: 'zomato' | 'swiggy') => {
    if (platform === 'zomato') {
      if (!zomatoStatus) {
        setActivePlatform('Zomato');
        setIsLoginModalOpen(true);
      } else {
        setZomatoStatus(false);
      }
    } else {
      if (!swiggyStatus) {
        setActivePlatform('Swiggy');
        setIsLoginModalOpen(true);
      } else {
        setSwiggyStatus(false);
      }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsFetching(true);
    // Simulate API Auth
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (activePlatform === 'Zomato') setZomatoStatus(true);
    else if (activePlatform === 'Swiggy') setSwiggyStatus(true);
    
    setIsFetching(false);
    setIsLoginModalOpen(false);
  };

  const handleManualSync = async () => {
    if (!isOnline) return;
    setIsFetching(true);
    const newItems = await ZomatoAPI.fetchOrders();
    setOrders(prev => [...newItems, ...prev]);
    setIsFetching(false);
  };

  const updateOrderStatus = async (id: string, newStatus: DeliveryOrder['status']) => {
    setUpdatingOrderId(id);
    const success = await ZomatoAPI.updateStatus(id, newStatus);
    
    if (success) {
      setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o));
    }
    setUpdatingOrderId(null);
  };

  const platformColor = activeTab === 'zomato' ? 'bg-[#E23744]' : 'bg-[#FC8019]';
  const platformName = activeTab === 'zomato' ? 'Zomato' : 'Swiggy';
  const isOnline = activeTab === 'zomato' ? zomatoStatus : swiggyStatus;

  return (
    <div className="p-8 space-y-8 min-h-screen pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Delivery Hub</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">Direct API tunnel to Zomato & Swiggy marketplaces.</p>
        </div>
        <div className="flex gap-3">
          <button 
            disabled={!isOnline || isFetching}
            onClick={handleManualSync}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            {isFetching ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />} 
            Sync Menu
          </button>
          <button 
            onClick={() => toggleStatus(activeTab)}
            className={`flex items-center gap-2 ${platformColor} text-white px-6 py-2.5 rounded-xl font-black shadow-xl transition-all hover:scale-105 active:scale-95`}
          >
            {isOnline ? 'Go Offline' : 'Go Online'}
          </button>
        </div>
      </div>

      <div className="flex gap-4 p-2 bg-white rounded-[24px] shadow-sm border border-gray-100 max-w-md mx-auto md:mx-0">
        <button 
          onClick={() => setActiveTab('zomato')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'zomato' ? 'bg-[#E23744] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}
        >
          <img src="https://www.zomato.com/favicon.ico" className="w-4 h-4 brightness-0 invert" alt="" /> Zomato
        </button>
        <button 
          onClick={() => setActiveTab('swiggy')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'swiggy' ? 'bg-[#FC8019] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}
        >
          <img src="https://www.swiggy.com/favicon.ico" className="w-4 h-4 brightness-0 invert" alt="" /> Swiggy
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-8">
             <div className="flex flex-col items-center text-center space-y-4">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center relative ${isOnline ? 'bg-green-100' : 'bg-gray-100'}`}>
                   <img src={activeTab === 'zomato' ? 'https://www.zomato.com/favicon.ico' : 'https://www.swiggy.com/favicon.ico'} className={`w-10 h-10 ${!isOnline && 'grayscale'}`} alt="" />
                   {isOnline && <span className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 border-4 border-white rounded-full animate-pulse"></span>}
                </div>
                <div>
                  <h4 className="text-xl font-black text-gray-800">{platformName} Store</h4>
                  <p className={`text-xs font-black uppercase tracking-widest ${isOnline ? 'text-green-600' : 'text-gray-400'}`}>
                    {isOnline ? 'Store is Online' : 'Store is Offline'}
                  </p>
                </div>
             </div>

             <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl">
                   <div className="flex items-center gap-3">
                      <Power size={20} className={isOnline ? 'text-green-500' : 'text-gray-400'} />
                      <span className="font-bold text-gray-700">Service Status</span>
                   </div>
                   <button onClick={() => toggleStatus(activeTab)} className={`w-12 h-6 rounded-full transition-all relative ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isOnline ? 'right-1' : 'left-1'}`}></div>
                   </button>
                </div>
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl">
                   <div className="flex items-center gap-3">
                      <Clock size={20} className="text-blue-500" />
                      <span className="font-bold text-gray-700">Operational Hours</span>
                   </div>
                   <span className="text-xs font-black text-blue-600">11 AM - 11 PM</span>
                </div>
             </div>

             {isOnline && (
               <div className="p-6 bg-green-50 rounded-[32px] border border-green-100 space-y-3">
                  <p className="text-[10px] font-black uppercase text-green-600 tracking-widest flex items-center gap-2">
                     <ShieldCheck size={14} /> API Endpoint Active
                  </p>
                  <p className="text-xs font-medium text-green-700 leading-relaxed">
                    Webhook handshake successful. Relaying order status in real-time.
                  </p>
               </div>
             )}
          </div>

          <div className={`p-8 rounded-[40px] text-white space-y-6 shadow-xl ${platformColor} relative overflow-hidden`}>
             <div className="absolute top-0 right-0 p-4 opacity-10"><Bell size={80} /></div>
             <h4 className="text-lg font-black flex items-center gap-2 relative z-10"><Bell size={20} /> Today's Performance</h4>
             <div className="grid grid-cols-2 gap-4 relative z-10">
                <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                   <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Orders</p>
                   <p className="text-2xl font-black">24</p>
                </div>
                <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                   <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Payout</p>
                   <p className="text-2xl font-black">₹4.2k</p>
                </div>
             </div>
             <button className="w-full py-3 bg-white text-gray-800 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-100 transition-all relative z-10">View API Logs</button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
           <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-8 border-b flex justify-between items-center bg-gray-50/50">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-100 text-slate-600 rounded-2xl">
                       <ShoppingBag size={24} />
                    </div>
                    <div>
                       <h4 className="text-xl font-black text-gray-800">Order Acceptance Queue</h4>
                       <p className="text-xs text-gray-500 font-bold uppercase tracking-widest flex items-center gap-2 mt-1">
                          {isOnline ? (
                            <><span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span> Live Orders</>
                          ) : (
                            'System Offline'
                          )}
                       </p>
                    </div>
                 </div>
                 <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border rounded-xl font-bold text-xs text-gray-600 shadow-sm">Active ({orders.filter(o => o.platform === platformName && o.status !== 'picked').length})</button>
                    <button className="px-4 py-2 text-xs font-bold text-gray-400">Past Orders</button>
                 </div>
              </div>

              <div className="flex-1 p-8 space-y-6 overflow-y-auto max-h-[700px]">
                 {!isOnline ? (
                   <div className="h-96 flex flex-col items-center justify-center text-gray-400 space-y-4">
                      <Power size={48} className="opacity-20" />
                      <div className="text-center">
                         <p className="font-black text-xs uppercase tracking-widest opacity-40">Connection Inactive</p>
                         <p className="text-sm font-medium mt-1">Turn on {platformName} service to receive orders.</p>
                      </div>
                   </div>
                 ) : (
                   <>
                    {orders.filter(o => o.platform === platformName).length === 0 ? (
                      <div className="h-96 flex flex-col items-center justify-center text-gray-400 space-y-4">
                          <ShoppingBag size={48} className="opacity-20" />
                          <p className="font-black text-xs uppercase tracking-widest opacity-40">Waiting for {platformName} orders...</p>
                      </div>
                    ) : (
                      orders.filter(o => o.platform === platformName).map((order) => (
                        <div key={order.id} className={`p-6 rounded-[32px] border-2 transition-all ${order.status === 'pending' ? 'border-orange-200 bg-orange-50/20' : 'border-gray-50 bg-white'}`}>
                            <div className="flex flex-col md:flex-row justify-between gap-6">
                              <div className="flex-1 space-y-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-black">#{order.id}</span>
                                        <span className="text-xs font-bold text-gray-400">{order.timestamp}</span>
                                    </div>
                                    <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                      order.status === 'pending' ? 'bg-orange-100 text-orange-600' : 
                                      order.status === 'preparing' ? 'bg-blue-100 text-blue-600' : 
                                      'bg-green-100 text-green-600'
                                    }`}>
                                      {order.status}
                                    </span>
                                  </div>
                                  <div>
                                    <h5 className="text-lg font-black text-gray-800">{order.customer}</h5>
                                    <div className="mt-3 space-y-2">
                                        {order.items.map((item, i) => (
                                          <p key={i} className="text-sm font-bold text-gray-600 flex items-center gap-2">
                                            <span className="w-5 h-5 bg-gray-100 rounded flex items-center justify-center text-[10px] font-black">{item.qty}</span>
                                            {item.name}
                                          </p>
                                        ))}
                                    </div>
                                  </div>
                              </div>
                              
                              <div className="flex md:flex-col justify-end gap-3 min-w-[200px]">
                                  {order.status === 'pending' ? (
                                    <>
                                      <button 
                                        disabled={updatingOrderId === order.id}
                                        onClick={() => updateOrderStatus(order.id, 'preparing')}
                                        className="flex-1 md:w-full py-4 bg-green-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-100 flex items-center justify-center gap-2 hover:bg-green-700 transition-all disabled:opacity-50"
                                      >
                                        {updatingOrderId === order.id ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />} 
                                        Accept Order
                                      </button>
                                      <button 
                                        className="flex-1 md:w-full py-4 bg-white border border-gray-200 text-red-500 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-50 transition-all"
                                      >
                                        <X size={18} /> Reject
                                      </button>
                                    </>
                                  ) : (
                                    <button 
                                      disabled={updatingOrderId === order.id || order.status === 'picked'}
                                      onClick={() => updateOrderStatus(order.id, order.status === 'preparing' ? 'ready' : 'picked')}
                                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                    >
                                      {updatingOrderId === order.id ? <Loader2 className="animate-spin" size={18} /> : order.status === 'preparing' ? 'Mark Ready' : 'Order Handover'}
                                    </button>
                                  )}
                                  <div className="flex items-center justify-between px-2 pt-2 border-t mt-2">
                                    <p className="text-xs font-bold text-gray-400">Bill Value</p>
                                    <p className="text-lg font-black text-gray-800">₹{order.total}</p>
                                  </div>
                              </div>
                            </div>
                        </div>
                      ))
                    )}
                   </>
                 )}
              </div>
           </div>
        </div>
      </div>

      {isLoginModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-[48px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className={`p-10 text-white flex flex-col items-center gap-4 ${activePlatform === 'Zomato' ? 'bg-[#E23744]' : 'bg-[#FC8019]'}`}>
                 <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-xl">
                    <img src={activePlatform === 'Zomato' ? 'https://www.zomato.com/favicon.ico' : 'https://www.swiggy.com/favicon.ico'} className="w-8 h-8" alt="" />
                 </div>
                 <div className="text-center">
                    <h3 className="text-2xl font-black tracking-tight">{activePlatform} Partner API</h3>
                    <p className="text-xs font-bold opacity-70 uppercase tracking-widest mt-1">Authenticate API Handshake</p>
                 </div>
              </div>
              
              <form onSubmit={handleLogin} className="p-10 space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Merchant API ID</label>
                    <div className="relative">
                       <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                       <input 
                        type="text" 
                        required
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-slate-900 transition-all outline-none" 
                        placeholder="PET-9281-POOJA"
                       />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Private Token</label>
                    <div className="relative">
                       <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                       <input 
                        type="password" 
                        required
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-slate-900 transition-all outline-none" 
                        placeholder="••••••••"
                       />
                    </div>
                 </div>
                 
                 <div className="pt-4 flex flex-col gap-4">
                    <button 
                      type="submit"
                      disabled={isFetching}
                      className={`w-full py-5 rounded-[24px] text-white font-black uppercase tracking-widest text-sm shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 ${activePlatform === 'Zomato' ? 'bg-[#E23744] shadow-red-100' : 'bg-[#FC8019] shadow-orange-100'}`}
                    >
                      {isFetching ? <Loader2 className="animate-spin" size={20} /> : <><ShieldCheck size={18} /> Verify & Link Account</>}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setIsLoginModalOpen(false)}
                      className="w-full py-4 text-gray-400 font-black uppercase tracking-widest text-[10px] hover:text-gray-600"
                    >
                      Cancel Handshake
                    </button>
                 </div>
                 
                 <p className="text-[9px] text-center text-gray-400 font-bold leading-relaxed px-4">
                    Connecting to {activePlatform} for Business API requires valid partner credentials. By proceeding, you authorize Petpooja Pro to manage your marketplace presence.
                 </p>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryIntegrations;
