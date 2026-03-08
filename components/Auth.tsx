
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Mail, Lock, User, Store, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { SubscriptionPlan, Organization, User as UserType } from '../types';
import { getSupabase, authService } from '../services/supabaseService';

interface AuthProps {
  initialPlan?: SubscriptionPlan;
  onAuthenticated: (org: Organization, user: UserType) => void;
  onCancel: () => void;
  type: 'login' | 'signup';
}

const Auth: React.FC<AuthProps> = ({ onCancel, type, onAuthenticated }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'details' | 'org'>('details');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    restaurantName: '',
  });

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const supabase = getSupabase();
    if (!supabase) return;

    if (type === 'signup' && step === 'details') {
      setStep('org');
      return;
    }

    setIsLoading(true);
    try {
      if (type === 'signup') {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: { data: { full_name: formData.name } }
        });

        if (authError) throw authError;
        if (authData.user) {
          try {
            const org = await authService.createCompany(formData.restaurantName, authData.user);
            onAuthenticated(org, authData.user as any);
            setIsLoading(false);
          } catch (initErr) {
            console.warn("Tenant auto-init deferred:", initErr);
            setIsLoading(false);
            navigate('/dashboard'); // AuthGuard will handle setup screen
          }
        }
      } else {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password
        });

        if (authError) throw authError;
        if (authData.user) {
          onAuthenticated(null as any, authData.user as any);
          setIsLoading(false);
        }
      }
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col md:flex-row animate-in fade-in duration-500 overflow-y-auto">
      <div className="hidden md:flex md:w-2/5 bg-slate-900 p-12 flex-col justify-between text-white relative overflow-hidden shrink-0">
        <div className="absolute top-0 right-0 p-20 opacity-10"><Store size={400} /></div>
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FF6B00] rounded-xl flex items-center justify-center font-black text-white text-xl">P</div>
          <span className="text-xl font-black tracking-tighter">PapaPos <span className="text-orange-50">Pro</span></span>
        </div>
        <div className="relative z-10 space-y-6">
          <h2 className="text-5xl font-black leading-tight tracking-tighter">Cloud-Native <span className="text-orange-500">Security.</span></h2>
          <p className="text-slate-400 font-medium text-lg leading-relaxed">Enterprise-grade multi-tenant architecture powered by Supabase PostgreSQL.</p>
        </div>
        <div className="relative z-10 pt-12 border-t border-slate-800 flex items-center gap-4 text-slate-500">
          <ShieldCheck size={20} /><p className="text-xs font-bold uppercase tracking-widest">JWT Auth & Audit Logging Active</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-full">
        <div className="p-6 flex justify-end"><button onClick={onCancel} className="p-3 hover:bg-gray-100 rounded-full text-slate-400"><X size={24} /></button></div>

        <div className="flex-1 flex items-center justify-center px-6 pb-20">
          <div className="w-full max-w-md space-y-10">
            <div className="text-center space-y-3">
              <h3 className="text-4xl font-black tracking-tighter text-slate-900">
                {type === 'signup' ? (step === 'details' ? 'Create Account' : 'Register Brand') : 'Authentication'}
              </h3>
              {error && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100">{error}</div>}
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              {step === 'details' && (
                <>
                  {type === 'signup' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                        <input 
                          type="text" required
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-orange-500 outline-none text-slate-900" 
                          placeholder="Your Name"
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Work Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input 
                        type="email" required
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-orange-500 outline-none text-slate-900" 
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Secure Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input 
                        type="password" required
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-orange-500 outline-none text-slate-900" 
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                      />
                    </div>
                  </div>
                </>
              )}

              {step === 'org' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Brand / Restaurant Name</label>
                  <div className="relative">
                    <Store className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      type="text" required
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-orange-500 outline-none text-slate-900" 
                      placeholder="e.g. PapaPos Gourmet"
                      value={formData.restaurantName}
                      onChange={(e) => setFormData({...formData, restaurantName: e.target.value})}
                    />
                  </div>
                </div>
              )}

              <button 
                disabled={isLoading}
                className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all"
              >
                {isLoading ? <Loader2 className="animate-spin" size={24} /> : (step === 'details' && type === 'signup' ? 'Continue' : `Secure Login`)}
                {!isLoading && <ArrowRight size={18} />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
