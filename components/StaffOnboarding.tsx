
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, Lock, Key, Smartphone, 
  ArrowRight, Loader2, CheckCircle2, User, 
  Store, ShieldAlert, Zap
} from 'lucide-react';
import { staffService } from '../services/staffService';

const StaffOnboarding: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState<'verify' | 'setup' | 'success'>('verify');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [staff, setStaff] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
    pin: '',
    confirmPin: ''
  });

  useEffect(() => {
    if (token) verify();
    else navigate('/');
  }, [token]);

  const verify = async () => {
    try {
      const data = await staffService.verifyOnboardingToken(token!);
      if (!data) throw new Error("Invalid or expired token.");
      setStaff(data);
      setStep('setup');
    } catch (e: any) {
      alert(e.message);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) return alert("Passwords do not match.");
    if (formData.pin !== formData.confirmPin) return alert("PINs do not match.");
    if (formData.pin.length !== 4) return alert("POS PIN must be exactly 4 digits.");

    setProcessing(true);
    try {
      await staffService.completeOnboarding(token!, formData.password, formData.pin);
      setStep('success');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
        <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Decrypting Security Token...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-inter">
      <div className="bg-white rounded-[56px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row">
        {/* Sidebar Info */}
        <div className="w-full md:w-2/5 bg-slate-900 p-10 text-white flex flex-col justify-between relative overflow-hidden shrink-0">
           <div className="absolute top-0 right-0 p-10 opacity-10"><ShieldCheck size={200} /></div>
           <div className="relative z-10 flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center font-black text-white">P</div>
              <span className="font-black tracking-tight text-sm uppercase">PapaPos <span className="text-orange-500">Secure</span></span>
           </div>
           
           <div className="relative z-10 space-y-6">
              <h2 className="text-3xl font-black leading-tight tracking-tight">Welcome to the <span className="text-orange-500">Team.</span></h2>
              <div className="space-y-4">
                 <div className="flex gap-3">
                    <User size={16} className="text-indigo-400 mt-1" />
                    <div>
                       <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Personnel</p>
                       <p className="text-sm font-bold">{staff?.full_name}</p>
                    </div>
                 </div>
                 <div className="flex gap-3">
                    <Store size={16} className="text-indigo-400 mt-1" />
                    <div>
                       <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Brand Access</p>
                       <p className="text-sm font-bold">{staff?.companies?.name}</p>
                    </div>
                 </div>
              </div>
           </div>

           <div className="relative z-10 pt-8 border-t border-white/10 flex items-center gap-3 opacity-50">
              <ShieldCheck size={16} /><p className="text-[8px] font-black uppercase tracking-widest">FIPS-140 Hashing Active</p>
           </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-10 md:p-14">
           {step === 'setup' && (
             <div className="space-y-8 animate-in fade-in duration-500">
                <div>
                   <h3 className="text-3xl font-black text-slate-900 tracking-tight">Security Vault Setup</h3>
                   <p className="text-sm font-medium text-slate-400 mt-2">Initialize your credentials to activate cloud access.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                   {/* Password Cluster */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-indigo-600">
                         <Lock size={16} />
                         <span className="text-[10px] font-black uppercase tracking-widest">Main Dashboard Access</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <input 
                           type="password" required placeholder="New Password"
                           className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" 
                           value={formData.password}
                           onChange={e => setFormData({...formData, password: e.target.value})}
                         />
                         <input 
                           type="password" required placeholder="Confirm Password"
                           className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" 
                           value={formData.confirmPassword}
                           onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                         />
                      </div>
                   </div>

                   {/* PIN Cluster */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-orange-600">
                         <Key size={16} />
                         <span className="text-[10px] font-black uppercase tracking-widest">POS Quick Login PIN</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <input 
                           type="password" required maxLength={4} placeholder="4-Digit PIN"
                           className="w-full p-4 bg-slate-50 rounded-2xl font-black text-center text-xl tracking-widest text-slate-900 outline-none focus:ring-2 focus:ring-orange-500" 
                           value={formData.pin}
                           onChange={e => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})}
                         />
                         <input 
                           type="password" required maxLength={4} placeholder="Confirm PIN"
                           className="w-full p-4 bg-slate-50 rounded-2xl font-black text-center text-xl tracking-widest text-slate-900 outline-none focus:ring-2 focus:ring-orange-500" 
                           value={formData.confirmPin}
                           onChange={e => setFormData({...formData, confirmPin: e.target.value.replace(/\D/g, '')})}
                         />
                      </div>
                   </div>

                   <button 
                     disabled={processing}
                     className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                   >
                      {processing ? <Loader2 className="animate-spin" size={24} /> : <><ShieldCheck size={20} /> Activate Identity</>}
                   </button>
                </form>
             </div>
           )}

           {step === 'success' && (
             <div className="h-full flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in duration-500">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[32px] flex items-center justify-center shadow-inner">
                   <CheckCircle2 size={48} />
                </div>
                <div>
                   <h3 className="text-3xl font-black text-slate-900 tracking-tight">Identity Fully Verified</h3>
                   <p className="text-sm font-medium text-slate-400 mt-2">You can now access your POS dashboard with your new credentials.</p>
                </div>
                <button 
                  onClick={() => navigate('/auth')}
                  className="w-full py-5 bg-emerald-600 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all"
                >
                   Enter Dashboard <ArrowRight size={20} />
                </button>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default StaffOnboarding;
