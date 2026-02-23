import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Cell, PieChart, Pie } from 'recharts';
import { 
  DollarSign, ShoppingBag, Users, TrendingUp, AlertTriangle, 
  Truck, Package, RefreshCcw, Loader2, Cloud, ShieldCheck, 
  Monitor, Info, Lock, ArrowUpRight, ArrowDownRight, LayoutGrid, 
  User as UserIcon, Calendar, Percent, ShieldAlert, BrainCircuit, ChevronRight, Zap, LineChart as LineChartIcon,
  Sparkles, BarChart3, Utensils
} from 'lucide-react';
import { analyticsService } from '../services/analyticsService';
import { aiService } from '../services/aiService';
import { forecastService } from '../services/forecastService';
import { authService, cloudOutlets } from '../services/supabaseService';
import { UserRole, Outlet, AIInsight, AIForecast } from '../types';
import { useNavigate } from 'react-router-dom';

const StatCard = ({ title, value, sub, icon: Icon, color, loading, isSensitive, role }: any) => {
  if (isSensitive && role === 'INVESTOR') return null;
  return (
    <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden group hover:shadow-xl transition-all duration-500">
      {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10"><Loader2 className="animate-spin text-indigo-300" size={24} /></div>}
      <div className="flex justify-between items-start relative z-10">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest leading-none">{title}</p>
            <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded-full">
              <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-[8px] font-black uppercase tracking-tighter">Live</span>
            </div>
          </div>
          <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{value}</h3>
          <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
             {sub}
          </p>
        </div>
        <div className={`p-4 rounded-2xl ${color} text-white shadow-lg shadow-current/20 group-hover:scale-110 transition-transform`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC<{ activeOutletId?: string | null }> = ({ activeOutletId }) => {
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<'TODAY' | 'YESTERDAY' | '30DAYS'>('TODAY');

  useEffect(() => {
    initDashboard();
  }, [activeOutletId, dateFilter]);

  const initDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await authService.getProfile();
      if (!profile) return navigate('/auth');
      setRole(profile.role);
      
      const today = new Date();
      let start = new Date(today);
      let end = new Date(today);
      
      if (dateFilter === 'TODAY') {
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
      } else if (dateFilter === 'YESTERDAY') {
        start.setDate(today.getDate() - 1);
        start.setHours(0,0,0,0);
        end.setDate(today.getDate() - 1);
        end.setHours(23,59,59,999);
      } else {
        start.setDate(today.getDate() - 30);
        start.setHours(0,0,0,0);
      }

      const params = { outletId: activeOutletId, startDate: start.toISOString(), endDate: end.toISOString() };

      const [liveData, topSold, fleet, aiData] = await Promise.all([
        analyticsService.getLiveStats(params),
        analyticsService.getTopItems(params),
        profile.role === 'OWNER' ? analyticsService.getTerminalFleet() : Promise.resolve([]),
        aiService.fetchInsights(activeOutletId)
      ]);

      setMetrics(liveData);
      setTopItems(topSold);
      setTerminals(fleet);
      setInsights(aiData);
    } catch (e: any) {
      console.error("Dashboard Core Failure:", e.message);
      setError(e.message || "Failed to sync with cloud database.");
    } finally {
      setLoading(false);
    }
  };

  const paymentChartData = useMemo(() => {
    if (!metrics?.payment_splits) return [];
    return Object.entries(metrics.payment_splits).map(([name, value]) => ({ name, value: value as number }));
  }, [metrics]);

  const hourlyData = useMemo(() => {
    if (!metrics?.hourly_sales) return [];
    return metrics.hourly_sales.map((sales: number, hour: number) => ({
      hour: `${hour}:00`,
      sales
    }));
  }, [metrics]);

  const hasData = metrics?.gross_sales > 0;

  return (
    <div className="p-8 space-y-10 pb-32 max-w-7xl mx-auto animate-in fade-in duration-700">
      {error && (
        <div className="bg-rose-50 border-2 border-rose-100 p-6 rounded-[40px] flex items-center gap-4 text-rose-700 shadow-lg">
           <ShieldAlert size={32} className="shrink-0" />
           <div>
              <h4 className="font-black uppercase text-xs">Analytics Pipeline Stalled</h4>
              <p className="text-sm font-medium mt-1">{error}</p>
           </div>
           <button onClick={initDashboard} className="ml-auto px-6 py-2 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase shadow-md">Retry Handshake</button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
             <Cloud size={16} />
             <span className="text-[10px] font-black uppercase tracking-widest">Live Operations Control • {new Date().toLocaleTimeString()}</span>
          </div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter leading-none">Insight Center</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
             {(['TODAY', 'YESTERDAY', '30DAYS'] as const).map(t => (
               <button key={t} onClick={() => setDateFilter(t)} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${dateFilter === t ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
                 {t}
               </button>
             ))}
          </div>
          <button onClick={initDashboard} disabled={loading} className="p-3.5 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:bg-slate-50 transition-all shadow-sm">
             {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCcw size={18} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Gross Sales" value={`₹${metrics?.gross_sales.toLocaleString() || '0'}`} sub={`${metrics?.order_count || 0} Bills`} icon={DollarSign} color="bg-orange-500" loading={loading} role={role} />
        <StatCard title="Total Tax" value={`₹${metrics?.total_tax.toLocaleString() || '0'}`} sub="GST Output" icon={ShieldCheck} color="bg-emerald-500" loading={loading} role={role} />
        <StatCard title="Avg. Order" value={`₹${metrics?.avg_bill.toFixed(0) || '0'}`} sub="Ticket Value" icon={ShoppingBag} color="bg-blue-500" loading={loading} role={role} />
        <StatCard title="Orders" value={metrics?.order_count || '0'} sub="Traffic Signal" icon={Users} color="bg-indigo-600" loading={loading} role={role} />
      </div>

      {!hasData && !loading ? (
        <div className="bg-white rounded-[60px] border-4 border-dashed border-slate-100 p-20 text-center space-y-6">
           <div className="w-24 h-24 bg-slate-50 rounded-[40px] flex items-center justify-center mx-auto">
              <BarChart3 size={48} className="text-slate-200" />
           </div>
           <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">No Sales Data Yet</h3>
              <p className="text-slate-400 text-sm font-bold max-w-xs mx-auto mt-2 uppercase tracking-widest leading-relaxed">Transactions from your POS terminals will appear here in real-time once synced to cloud.</p>
           </div>
           <button onClick={initDashboard} className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl active:scale-95 transition-all">Refresh Pipeline</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
         <div className="lg:col-span-2 space-y-10">
            <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm space-y-10">
               <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Hourly Sales Pattern</h3>
               <div className="h-80 w-full relative">
                  {!hasData && !loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-slate-300">
                       {/* Fix: Added missing BarChart3 import */}
                       <BarChart3 size={48} className="opacity-20 mb-2" />
                       <p className="font-black uppercase text-[10px]">No transactions yet</p>
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hourlyData}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FF6B00" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#FF6B00" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="hour" tick={{fontSize: 10, fontWeight: 900, fill: '#cbd5e1'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#cbd5e1'}} />
                      <Tooltip contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                      <Area type="monotone" dataKey="sales" stroke="#FF6B00" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
                    </AreaChart>
                  </ResponsiveContainer>
               </div>
            </div>

            <div className="bg-white rounded-[48px] border border-slate-100 shadow-sm overflow-hidden">
               <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Top Selling Items</h3>
                  <LayoutGrid size={18} className="text-slate-400" />
               </div>
               <div className="p-8">
                  {topItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-4">
                       {/* Fix: Added missing Utensils import */}
                       <Utensils size={48} className="text-slate-100" />
                       <p className="text-center text-slate-400 font-bold uppercase text-xs">No item movement recorded for this period</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {topItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between">
                           <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-400">#{i+1}</div>
                              <div>
                                 <p className="font-black text-slate-800">{item.name}</p>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase">{item.quantity} Units Sold</p>
                              </div>
                           </div>
                           <div className="text-right">
                              <p className="font-black text-slate-900">₹{item.revenue.toLocaleString()}</p>
                              <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                 <div className="bg-orange-500 h-full" style={{ width: `${(item.revenue / topItems[0].revenue) * 100}%` }}></div>
                              </div>
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
               </div>
            </div>
         </div>

         <div className="space-y-10">
            <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm">
               <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8 text-center">Settlement Mix</h3>
               <div className="h-64 relative">
                  {!hasData && !loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-slate-300">
                       <DollarSign size={40} className="opacity-10 mb-1" />
                       <p className="font-black uppercase text-[8px]">Pending Funds</p>
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentChartData.length > 0 ? paymentChartData : [{name: 'Empty', value: 1}]} innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value">
                        {paymentChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={['#FF6B00', '#6366f1', '#10b981', '#f59e0b'][index % 4]} />)}
                        {paymentChartData.length === 0 && <Cell fill="#f1f5f9" />}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
               </div>
               <div className="mt-6 space-y-3">
                  {paymentChartData.length === 0 ? (
                     <div className="text-center py-4 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                        <p className="text-[10px] font-black text-slate-400 uppercase">Awaiting Settlement</p>
                     </div>
                  ) : paymentChartData.map((p, i) => (
                    <div key={i} className="flex justify-between items-center text-xs">
                       <span className="font-bold text-slate-500">{p.name}</span>
                       <span className="font-black text-slate-900">₹{p.value.toLocaleString()}</span>
                    </div>
                  ))}
               </div>
            </div>

            {role === 'OWNER' && (
              <div className="bg-slate-900 p-10 rounded-[48px] text-white space-y-8 relative overflow-hidden shadow-2xl">
                 <div className="absolute top-0 right-0 p-8 opacity-10"><Monitor size={120} /></div>
                 <h4 className="text-lg font-black tracking-tight uppercase relative z-10">Fleet Radar</h4>
                 <div className="space-y-4 relative z-10">
                    {terminals.length === 0 ? (
                       <div className="py-10 text-center border-2 border-dashed border-white/10 rounded-[32px]">
                          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">No terminals registered</p>
                       </div>
                    ) : terminals.slice(0, 4).map(t => (
                      <div key={t.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all">
                         <div className="flex items-center gap-3">
                            <Monitor size={16} className={t.status === 'APPROVED' ? 'text-emerald-400' : 'text-rose-400'} />
                            <p className="text-xs font-black truncate max-w-[120px]">{t.name || 'Terminal'}</p>
                         </div>
                         <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${t.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>{t.status}</span>
                      </div>
                    ))}
                 </div>
              </div>
            )}
         </div>
      </div>
     )}
    </div>
  );
};

export default Dashboard;