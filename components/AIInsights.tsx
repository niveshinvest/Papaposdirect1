
import React, { useState, useEffect } from 'react';
import { aiService } from '../services/aiService';
import { forecastService } from '../services/forecastService';
import { authService } from '../services/supabaseService';
import { AIInsight, AIRecommendation, AIForecast, UserRole } from '../types';
import { 
  BrainCircuit, Sparkles, AlertCircle, TrendingUp, Zap, 
  Loader2, Lock, ArrowRight, ShieldAlert, CheckCircle, 
  Fingerprint, MessageSquare, Target, Info, ShieldCheck,
  ChevronRight, ArrowLeft, RefreshCcw, Eye, Trash2,
  DollarSign, ListFilter, Users, BarChart3, ThumbsUp, X,
  LineChart as LineChartIcon, Calendar, ArrowUpRight, TrendingDown,
  Scale, Database, FileText, Activity
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface AIInsightsProps {
  salesData: any[];
  menuItems: any[];
  activeOutletId?: string | null;
}

const AIInsights: React.FC<AIInsightsProps> = ({ activeOutletId }) => {
  const [activeTab, setActiveTab] = useState<'ALERTS' | 'STRATEGY' | 'FORECAST'>('ALERTS');
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [forecasts, setForecasts] = useState<AIForecast[]>([]);
  const [selectedInsight, setSelectedInsight] = useState<AIInsight | null>(null);
  const [showExplanation, setShowExplanation] = useState<any>(null); // For any AI object type
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [isProcessingReco, setIsProcessingReco] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  useEffect(() => {
    loadUser();
    loadData();
  }, [activeOutletId, activeTab]);

  const loadUser = async () => {
    const profile = await authService.getProfile();
    setUserRole(profile?.role || null);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'ALERTS') {
        const data = await aiService.fetchInsights(activeOutletId);
        const filtered = userRole === 'INVESTOR' 
          ? data.filter(i => ['SALES', 'PAYMENTS', 'MARGIN', 'COMPLIANCE'].includes(i.category))
          : data;
        setInsights(filtered);
      } else if (activeTab === 'STRATEGY') {
        const data = await aiService.fetchRecommendations(activeOutletId);
        const filtered = userRole === 'INVESTOR'
          ? data.filter(r => r.type !== 'STAFFING')
          : data;
        setRecommendations(filtered);
      } else {
        const data = await forecastService.fetchLatestForecasts(activeOutletId);
        setForecasts(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAudit = async () => {
    if (!activeOutletId || userRole === 'INVESTOR') return;
    setAuditing(true);
    try {
      if (activeTab === 'ALERTS') {
        const fresh = await aiService.generateFreshInsights(activeOutletId);
        setInsights(prev => [...fresh, ...prev]);
      } else if (activeTab === 'STRATEGY') {
        const fresh = await aiService.generateStrategicRecommendations(activeOutletId);
        setRecommendations(prev => [...fresh, ...prev]);
      } else {
        await forecastService.generateForecast(activeOutletId, '7_DAYS');
        await forecastService.generateForecast(activeOutletId, '30_DAYS');
        const refreshed = await forecastService.fetchLatestForecasts(activeOutletId);
        setForecasts(refreshed);
      }
    } catch (e: any) {
      alert(`Process halted: ${e.message}`);
    } finally {
      setAuditing(false);
    }
  };

  const handleUpdateReco = async (id: string, status: 'APPROVED' | 'DISMISSED') => {
    if (userRole === 'INVESTOR') return;
    setIsProcessingReco(id);
    try {
      await aiService.updateRecommendationStatus(id, status);
      setRecommendations(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      alert("Action failed.");
    } finally {
      setIsProcessingReco(null);
    }
  };

  const handleDismiss = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (userRole === 'INVESTOR') return;
    try {
      await aiService.dismissInsight(id);
      setInsights(prev => prev.filter(i => i.id !== id));
      if (selectedInsight?.id === id) setSelectedInsight(null);
    } catch (e) {
      alert("Action failed.");
    }
  };

  const getSeverityStyles = (severity: string) => {
    switch(severity) {
      case 'CRITICAL': return 'bg-rose-50 border-rose-200 text-rose-600';
      case 'HIGH': return 'bg-orange-50 border-orange-200 text-orange-600';
      case 'MEDIUM': return 'bg-indigo-50 border-indigo-200 text-indigo-600';
      default: return 'bg-slate-50 border-slate-200 text-slate-600';
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch(cat) {
      case 'SALES': case 'PRICING': return <TrendingUp size={16} />;
      case 'STAFF': case 'STAFFING': return <Fingerprint size={16} />;
      case 'FLEET': return <ShieldCheck size={16} />;
      case 'PAYMENTS': return <Target size={16} />;
      case 'COMPLIANCE': return <ShieldAlert size={16} />;
      case 'MENU': return <ListFilter size={16} />;
      default: return <Info size={16} />;
    }
  };

  const renderExplanationDrawer = () => {
    if (!showExplanation) return null;
    const { explanation_object: exp, data_lineage: lin, compute_metadata: comp, legal_disclaimer: disc } = showExplanation;

    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-end bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-2xl h-screen shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
          <div className="p-8 border-b bg-slate-900 text-white flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-500 rounded-2xl">
                <BrainCircuit size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Technical Justification</h3>
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Explainability & Compliance Audit</p>
              </div>
            </div>
            <button onClick={() => setShowExplanation(null)} className="p-3 hover:bg-white/10 rounded-full transition-all">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-10 space-y-10">
             {exp ? (
               <section className="space-y-6">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                    <Zap size={14} /> Neural Trigger Logic
                  </h4>
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase">Primary Condition</p>
                      <p className="text-slate-800 font-bold">{exp.trigger_condition}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-white rounded-2xl border border-slate-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Confidence</p>
                        <p className="text-lg font-black text-indigo-600">{(exp.confidence_score * 100).toFixed(0)}%</p>
                      </div>
                      <div className="p-4 bg-white rounded-2xl border border-slate-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Rows Evaluated</p>
                        <p className="text-lg font-black text-slate-800">{exp.data_points_evaluated || '---'}</p>
                      </div>
                    </div>
                  </div>
               </section>
             ) : (
               <div className="p-8 bg-rose-50 text-rose-600 rounded-3xl border border-rose-100 flex items-center gap-3">
                 <AlertCircle size={20} />
                 <p className="text-sm font-bold">Explanation not generated for this node.</p>
               </div>
             )}

             <section className="space-y-6">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <Database size={14} /> Data Lineage (Audit Trail)
                </h4>
                {lin ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {lin.tables.map((t: string) => (
                        <span key={t} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase border border-indigo-100">{t}</span>
                      ))}
                    </div>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Extraction Window</p>
                      <p className="text-sm font-bold text-slate-700">{new Date(lin.date_range.start).toLocaleDateString()} — {new Date(lin.date_range.end).toLocaleDateString()}</p>
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Model Constraints</p>
                        <ul className="space-y-1">
                          {lin.limitations.map((l: string, i: number) => <li key={i} className="text-xs text-slate-500 flex items-center gap-2 italic">• {l}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : <p className="text-xs text-slate-400 italic">Identity lineage unavailable.</p>}
             </section>

             <section className="space-y-6">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <Activity size={14} /> Compute telemetry
                </h4>
                {comp ? (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                       <p className="text-[8px] font-black text-slate-400 uppercase">Cost Tier</p>
                       <p className={`text-xs font-black mt-1 ${comp.cost_tier === 'HIGH' ? 'text-rose-600' : comp.cost_tier === 'MEDIUM' ? 'text-amber-600' : 'text-emerald-600'}`}>{comp.cost_tier}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                       <p className="text-[8px] font-black text-slate-400 uppercase">Latency</p>
                       <p className="text-xs font-black text-slate-800 mt-1">{comp.computation_time_ms}ms</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                       <p className="text-[8px] font-black text-slate-400 uppercase">Reason</p>
                       <p className="text-[8px] font-black text-slate-500 mt-1 truncate">{comp.execution_reason}</p>
                    </div>
                  </div>
                ) : null}
             </section>
          </div>

          <div className="p-10 bg-slate-50 border-t">
             <div className="p-6 bg-white rounded-3xl border-2 border-slate-200 space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck size={14} className="text-indigo-500" /> Regulatory Disclaimer
                </p>
                <p className="text-xs font-medium text-slate-600 leading-relaxed italic">
                  "{disc || 'This insight is advisory in nature and does not constitute legal, tax, or accounting advice.'}"
                </p>
             </div>
             <button onClick={() => setShowExplanation(null)} className="w-full mt-6 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs">Acknowledge Reasoning</button>
          </div>
        </div>
      </div>
    );
  };

  if (selectedInsight) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-10 animate-in slide-in-from-right-4 duration-500 pb-32">
         <button onClick={() => setSelectedInsight(null)} className="flex items-center gap-2 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-900 transition-all">
            <ArrowLeft size={14} /> Back to Hub
         </button>

         <div className={`p-10 rounded-[56px] border-4 border-white shadow-2xl space-y-8 ${getSeverityStyles(selectedInsight.severity)}`}>
            <div className="flex justify-between items-start">
               <div className="p-5 bg-white rounded-3xl shadow-sm">
                  {getCategoryIcon(selectedInsight.category)}
               </div>
               <div className="flex gap-2">
                 <button onClick={() => setShowExplanation(selectedInsight)} className="px-4 py-1.5 bg-white/50 hover:bg-white rounded-full font-black text-[10px] uppercase tracking-widest shadow-sm transition-all flex items-center gap-2">
                    <Info size={14} /> Explain
                 </button>
                 <span className="px-4 py-1.5 bg-white rounded-full font-black text-[10px] uppercase tracking-widest shadow-sm">
                    {selectedInsight.severity} Priority
                 </span>
               </div>
            </div>
            <div className="space-y-4">
               <h3 className="text-4xl font-black tracking-tighter leading-tight">{selectedInsight.title}</h3>
               <p className="text-xl font-bold leading-relaxed">{selectedInsight.summary}</p>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm space-y-6">
               <h4 className="font-black text-slate-400 uppercase text-[10px] tracking-widest flex items-center gap-2">
                  <BrainCircuit size={14} /> Neural Interpretation
               </h4>
               <p className="text-slate-600 font-medium leading-relaxed">
                  {selectedInsight.explanation}
               </p>
            </div>
            <div className="bg-slate-900 p-10 rounded-[48px] text-white space-y-6 shadow-2xl">
               <h4 className="font-black text-orange-500 uppercase text-[10px] tracking-widest flex items-center gap-2">
                  <Target size={14} /> Recommended Action
               </h4>
               <p className="text-lg font-bold leading-relaxed">
                  {selectedInsight.recommended_action}
               </p>
               {userRole !== 'INVESTOR' && (
                 <button className="w-full py-5 bg-white text-slate-900 rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-slate-100 transition-all">
                    Acknowledge Policy
                 </button>
               )}
            </div>
         </div>

         <div className="p-8 bg-slate-50 rounded-[40px] border border-slate-100 italic">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Scale size={14} /> Legal Status
            </p>
            <p className="text-xs font-medium text-slate-500 leading-relaxed">
              {selectedInsight.legal_disclaimer}
            </p>
         </div>
         {renderExplanationDrawer()}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
           <div className="p-5 bg-slate-900 text-white rounded-[32px] shadow-2xl relative overflow-hidden">
              <BrainCircuit size={40} className="relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-transparent opacity-20"></div>
           </div>
           <div>
              <div className="flex items-center gap-2">
                <h2 className="text-4xl font-black tracking-tighter text-slate-900">Intelligence Hub</h2>
                <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-[9px] font-black uppercase tracking-tighter">Live</span>
                </div>
              </div>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">
                {userRole === 'INVESTOR' ? 'Investor Analysis Active' : 'Owner Control Plane Active'}
              </p>
           </div>
        </div>
        <div className="flex gap-3">
           <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm mr-2 overflow-x-auto scrollbar-hide">
              <button onClick={() => setActiveTab('ALERTS')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'ALERTS' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400'}`}>Audits</button>
              <button onClick={() => setActiveTab('STRATEGY')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'STRATEGY' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400'}`}>Strategy</button>
              <button onClick={() => setActiveTab('FORECAST')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'FORECAST' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400'}`}>Forecasts</button>
           </div>
           {userRole !== 'INVESTOR' && (
             <button 
               onClick={handleRunAudit}
               disabled={auditing || !activeOutletId}
               className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-105 transition-all flex items-center gap-3 active:scale-95 disabled:opacity-50"
             >
                {auditing ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                Refresh Intelligence
             </button>
           )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 space-y-6">
           <Loader2 className="animate-spin text-indigo-500" size={64} />
           <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Querying Synthetic Neural Context...</p>
        </div>
      ) : activeTab === 'ALERTS' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           {insights.length === 0 ? (
             <div className="col-span-full py-32 bg-white rounded-[60px] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-center space-y-6">
                <div className="p-10 bg-slate-50 rounded-full text-slate-200">
                   <ShieldCheck size={80} />
                </div>
                <h3 className="text-2xl font-black text-slate-800">Operations Integrity Optimal</h3>
             </div>
           ) : insights.map(insight => (
             <div key={insight.id} onClick={() => setSelectedInsight(insight)} className="bg-white rounded-[44px] border border-slate-100 shadow-sm p-8 flex flex-col justify-between group hover:shadow-2xl hover:border-indigo-100 transition-all cursor-pointer relative overflow-hidden">
                <div className="space-y-6 relative z-10">
                   <div className="flex justify-between items-center">
                      <div className={`p-3 rounded-2xl ${getSeverityStyles(insight.severity)}`}>
                         {getCategoryIcon(insight.category)}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setShowExplanation(insight); }} className="p-1.5 text-slate-200 hover:text-indigo-600 transition-colors">
                          <Info size={14} />
                        </button>
                        {userRole !== 'INVESTOR' && (
                          <button onClick={(e) => handleDismiss(insight.id, e)} className="p-1.5 text-slate-200 hover:text-rose-500 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                   </div>
                   <div>
                      <h4 className="text-xl font-black text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors">{insight.title}</h4>
                      <p className="text-xs text-slate-500 font-medium mt-3 line-clamp-2 leading-relaxed">{insight.summary}</p>
                   </div>
                </div>
                <div className="mt-8 pt-8 border-t border-slate-50 flex items-center justify-between text-indigo-600 font-black text-[10px] uppercase tracking-widest group-hover:gap-4 transition-all">
                   <span>Root Cause</span>
                   <ChevronRight size={16} />
                </div>
             </div>
           ))}
        </div>
      ) : activeTab === 'STRATEGY' ? (
        <div className="space-y-8">
           {recommendations.length === 0 ? (
             <div className="py-32 bg-slate-900 rounded-[60px] text-white flex flex-col items-center justify-center text-center space-y-6 shadow-2xl">
                <div className="p-8 bg-white/10 rounded-full">
                   <Sparkles size={64} className="text-indigo-400" />
                </div>
                <h3 className="text-2xl font-black">Strategic Pipeline Empty</h3>
             </div>
           ) : (
             <div className="grid grid-cols-1 gap-8">
                {recommendations.map(reco => (
                  <div key={reco.id} className="bg-white rounded-[48px] border border-slate-100 shadow-sm overflow-hidden flex flex-col md:flex-row group hover:shadow-2xl transition-all">
                     <div className={`w-full md:w-80 p-10 flex flex-col justify-between items-center text-center border-b md:border-b-0 md:border-r border-slate-50 ${reco.type === 'PRICING' ? 'bg-orange-50/30' : reco.type === 'STAFFING' ? 'bg-indigo-50/30' : 'bg-emerald-50/30'}`}>
                        <div className={`p-6 rounded-[32px] shadow-lg mb-6 ${reco.type === 'PRICING' ? 'bg-orange-500 text-white' : reco.type === 'STAFFING' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}`}>
                           {getCategoryIcon(reco.type)}
                        </div>
                        <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter">{reco.type}</h4>
                        <div className="mt-8 p-4 bg-white rounded-2xl border border-slate-100 w-full">
                           <p className="text-[10px] font-black uppercase text-emerald-500 mb-1">Potential Impact</p>
                           <p className="text-xs font-bold text-slate-600">{reco.expected_impact}</p>
                        </div>
                        <button onClick={() => setShowExplanation(reco)} className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 hover:text-slate-900 transition-all">
                          <BrainCircuit size={14} /> Explain logic
                        </button>
                     </div>
                     <div className="flex-1 p-10 space-y-8">
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">{reco.title}</h3>
                        <p className="text-sm font-medium text-slate-700 leading-relaxed italic">"{reco.rationale}"</p>
                        <div className="pt-8 border-t border-slate-50 flex flex-col md:flex-row items-center justify-between gap-6">
                           <div className="flex items-center gap-6">
                              {reco.current_value && <div><p className="text-[9px] font-black uppercase text-slate-400">Current</p><p className="font-black text-slate-900">{JSON.stringify(reco.current_value).replace(/[{}"]/g, '')}</p></div>}
                              {reco.current_value && <ArrowRight size={20} className="text-slate-200" />}
                              {reco.suggested_value && <div><p className="text-[9px] font-black uppercase text-indigo-600">Suggested</p><p className="font-black text-indigo-700">{JSON.stringify(reco.suggested_value).replace(/[{}"]/g, '')}</p></div>}
                           </div>
                           {userRole !== 'INVESTOR' && (
                             <div className="flex gap-3">
                                <button onClick={() => handleUpdateReco(reco.id, 'DISMISSED')} className="px-6 py-3 bg-white border border-slate-200 text-slate-400 rounded-xl font-black uppercase text-[10px] tracking-widest">Dismiss</button>
                                <button onClick={() => handleUpdateReco(reco.id, 'APPROVED')} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center gap-2">Approve</button>
                             </div>
                           )}
                        </div>
                     </div>
                  </div>
                ))}
             </div>
           )}
        </div>
      ) : (
        <div className="space-y-12">
          {forecasts.length === 0 ? (
            <div className="py-32 bg-white rounded-[60px] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-center space-y-6">
               <LineChartIcon size={80} className="text-indigo-200" />
               <h3 className="text-2xl font-black text-slate-800">Demand Forecast Pending</h3>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
               {forecasts.map(fc => (
                 <div key={fc.id} className="bg-white rounded-[56px] border border-slate-100 shadow-sm p-10 flex flex-col justify-between hover:shadow-2xl transition-all relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-10">
                       <div className="flex items-center gap-4">
                          <div className="p-4 bg-indigo-600 text-white rounded-3xl shadow-lg">
                             <Calendar size={24} />
                          </div>
                          <div>
                             <h4 className="text-2xl font-black tracking-tight text-slate-900">Next {fc.horizon.replace('_', ' ')}</h4>
                             <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">Confidence Score: {(fc.confidence_score * 100).toFixed(0)}%</p>
                          </div>
                       </div>
                       <button onClick={() => setShowExplanation(fc)} className="p-2.5 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all border border-slate-100">
                          <BrainCircuit size={20} />
                       </button>
                    </div>

                    <div className="grid grid-cols-2 gap-10 mb-12">
                       <div className="space-y-2">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expected Intake Range</p>
                          <div className="flex items-baseline gap-2">
                             <h3 className="text-4xl font-black text-slate-900 tracking-tighter">₹{fc.predicted_revenue_min.toLocaleString()}</h3>
                             <span className="text-slate-300 font-bold">~</span>
                             <h3 className="text-4xl font-black text-indigo-600 tracking-tighter">₹{fc.predicted_revenue_max.toLocaleString()}</h3>
                          </div>
                       </div>
                       <div className="space-y-2 text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Orders</p>
                          <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{fc.predicted_orders}</h3>
                          <p className="text-[10px] font-bold text-slate-400">Precision Error: +/- {fc.error_margin_percent}%</p>
                       </div>
                    </div>

                    <div className="bg-slate-50 p-8 rounded-[40px] border border-slate-100">
                       <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Info size={14} /> Historical Inference
                       </h5>
                       <p className="text-sm font-medium text-slate-700 leading-relaxed italic">"{fc.assumptions}"</p>
                    </div>
                 </div>
               ))}
            </div>
          )}
        </div>
      )}
      {renderExplanationDrawer()}
    </div>
  );
};

export default AIInsights;
